import time
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

import httpx

from app.config import get_settings
from app.models.enums import Currency

# Banco Central do Brasil's official PTAX rate: the legal reference for converting
# foreign currency to BRL in Brazil (Receita Federal requires it for tax purposes),
# and what a Brazilian search for "dólar hoje"/"euro hoje" normally reflects. A
# EUR-triangulated European reference rate (this app's previous source) routinely
# diverges from it by up to ~1% - different institution, different fixing time,
# different methodology, even for the same calendar day.
#
# PTAX publishes several intraday quotes ("boletins": Abertura, Intermediário x N,
# Fechamento) - only the closing one is used, since that's what "the dollar/euro
# today" means in everyday and accounting use. Of its "compra"/"venda" (buy/sell)
# pair, "venda" is used uniformly for both entries and expenses: simpler than
# splitting by direction, and the number most people mean by "the rate today".
BCB_DAY_URL = (
    "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/"
    "CotacaoMoedaDia(moeda=@moeda,dataCotacao=@dataCotacao)"
)
BCB_PERIOD_URL = (
    "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/"
    "CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)"
)
TRACKED_CURRENCIES = ("USD", "EUR")
REQUEST_TIMEOUT_SECONDS = 5.0
RATES_CACHE_TTL_SECONDS = 3600
HISTORY_CACHE_TTL_SECONDS = 3600
# PTAX isn't published on weekends/holidays - look back far enough to always cross at
# least one prior business day, even across a long holiday weekend (e.g. Carnival).
LOOKBACK_DAYS = 10
# BACEN labels the day's closing boletim inconsistently across its own endpoints
# ("Fechamento" on the period endpoint, "Fechamento PTAX" on the single-day one) -
# match either by prefix.
_CLOSING_BOLETIM_PREFIX = "Fechamento"

# Module-level in-memory caches (single-process deployment; no need for a DB-backed
# cache at this scale). PTAX itself only republishes once a day, so an hourly TTL is
# already far more frequent than the data actually changes.
_rates_cache: dict[str, float | None] = {"data": None, "fetched_at": 0.0}
_history_cache: dict[str, object] = {"data": None, "days": None, "fetched_at": 0.0}
# Keyed by isoformat date string. Past dates never change once published, so entries
# are cached indefinitely (unlike the TTL caches above) rather than expired.
_date_rate_cache: dict[str, dict[str, float | str]] = {}


def _bcb_date(d: date) -> str:
    return d.strftime("%m-%d-%Y")


def _closing_quote_from_rows(rows: list[dict]) -> tuple[float, date] | None:
    """Picks the day's closing ("Fechamento") selling rate out of a list of PTAX
    boletim rows - the last one chronologically, if any match."""
    closings = [r for r in rows if r["tipoBoletim"].startswith(_CLOSING_BOLETIM_PREFIX)]
    if not closings:
        return None
    latest = closings[-1]
    quote_date = date.fromisoformat(latest["dataHoraCotacao"][:10])
    return float(latest["cotacaoVenda"]), quote_date


def _fetch_closing_quote(moeda: str, on_date: date) -> tuple[float, date] | None:
    """The PTAX closing selling rate (BRL per 1 unit of `moeda`) for `on_date`, or -
    if that day had no boletim (weekend/holiday) - for the closest prior business day
    within `LOOKBACK_DAYS`. Returns (rate, actual_date_used)."""
    day_response = httpx.get(
        BCB_DAY_URL,
        params={"@moeda": f"'{moeda}'", "@dataCotacao": f"'{_bcb_date(on_date)}'", "$format": "json"},
        timeout=REQUEST_TIMEOUT_SECONDS,
        follow_redirects=True,
    )
    day_response.raise_for_status()
    same_day = _closing_quote_from_rows(day_response.json()["value"])
    if same_day is not None:
        return same_day

    start = on_date - timedelta(days=LOOKBACK_DAYS)
    period_response = httpx.get(
        BCB_PERIOD_URL,
        params={
            "@moeda": f"'{moeda}'",
            "@dataInicial": f"'{_bcb_date(start)}'",
            "@dataFinalCotacao": f"'{_bcb_date(on_date)}'",
            "$format": "json",
        },
        timeout=REQUEST_TIMEOUT_SECONDS,
        follow_redirects=True,
    )
    period_response.raise_for_status()
    return _closing_quote_from_rows(period_response.json()["value"])


def _fetch_rates(on_date: date) -> dict[str, float | str] | None:
    """{"date": ..., "BRL": 1.0, "USD": <USD per 1 BRL>, "EUR": <EUR per 1 BRL>} as of
    the most recent business day on or before `on_date` - "how many units of foreign
    currency is 1 BRL worth", same convention every caller (display conversion,
    convert_to_brl) already expects. None if the provider is unreachable or has no
    data at all in the lookback window."""
    result: dict[str, float | str] = {"BRL": 1.0}
    resolved_date: date | None = None
    try:
        for code in TRACKED_CURRENCIES:
            quote = _fetch_closing_quote(code, on_date)
            if quote is None:
                return None
            cotacao_venda, quote_date = quote
            result[code] = 1 / cotacao_venda
            # Every tracked currency shares the same trading calendar, so this is the
            # same date every iteration - just take whichever came back.
            resolved_date = quote_date
    except (httpx.HTTPError, KeyError, ValueError, TypeError, IndexError):
        return None

    result["date"] = resolved_date.isoformat() if resolved_date else on_date.isoformat()
    return result


def get_live_rates() -> dict[str, float]:
    """Current BRL -> {USD, EUR} rates from the Banco Central do Brasil's PTAX
    (closing/"venda"), cached for an hour. Falls back to the static, env-configured
    rates if the provider is unreachable, so a dashboard load never hard-fails just
    because of the network."""
    now = time.time()
    cached = _rates_cache["data"]
    if cached is not None and (now - _rates_cache["fetched_at"]) < RATES_CACHE_TTL_SECONDS:
        return cached  # type: ignore[return-value]

    settings = get_settings()
    fallback = {"BRL": 1.0, "USD": settings.exchange_rate_usd, "EUR": settings.exchange_rate_eur}

    fetched = _fetch_rates(date.today())
    if fetched is None:
        return fallback
    rates = {"BRL": 1.0, "USD": fetched["USD"], "EUR": fetched["EUR"]}

    _rates_cache["data"] = rates
    _rates_cache["fetched_at"] = now
    return rates


def get_rate_history(days: int) -> list[dict[str, float | str]] | None:
    """Daily BRL -> {USD, EUR} PTAX closing rates for the last `days` days. Returns
    None (no fallback data exists) if the provider is unreachable - the caller decides
    how to surface that to the client. Weekends/holidays have no closing boletim and
    are simply absent from the series."""
    now = time.time()
    if (
        _history_cache["data"] is not None
        and _history_cache["days"] == days
        and (now - _history_cache["fetched_at"]) < HISTORY_CACHE_TTL_SECONDS
    ):
        return _history_cache["data"]  # type: ignore[return-value]

    end = date.today()
    start = end - timedelta(days=days)

    by_date: dict[str, dict[str, float]] = {}
    try:
        for code in TRACKED_CURRENCIES:
            response = httpx.get(
                BCB_PERIOD_URL,
                params={
                    "@moeda": f"'{code}'",
                    "@dataInicial": f"'{_bcb_date(start)}'",
                    "@dataFinalCotacao": f"'{_bcb_date(end)}'",
                    "$format": "json",
                },
                timeout=REQUEST_TIMEOUT_SECONDS,
                follow_redirects=True,
            )
            response.raise_for_status()
            for row in response.json()["value"]:
                if not row["tipoBoletim"].startswith(_CLOSING_BOLETIM_PREFIX):
                    continue
                day = row["dataHoraCotacao"][:10]
                by_date.setdefault(day, {})[code] = 1 / float(row["cotacaoVenda"])
    except (httpx.HTTPError, KeyError, ValueError, TypeError):
        return None

    points = [
        {"date": day, **values}
        for day, values in sorted(by_date.items())
        if all(code in values for code in TRACKED_CURRENCIES)
    ]

    _history_cache["data"] = points
    _history_cache["days"] = days
    _history_cache["fetched_at"] = now
    return points


def get_rate_for_date(target_date: date) -> dict[str, float | str]:
    """BRL -> {USD, EUR} rates as of a specific date. `target_date` today or in the
    future is routed to `get_live_rates` (no historical rate can exist yet for it);
    the returned "date" is always today's in that case. For a past date, resolves to
    the closest prior business day BACEN actually published a PTAX closing rate for
    (weekends/holidays have none) - the returned "date" reflects whichever day that
    actually was, not necessarily `target_date`. Falls back to the static
    env-configured rates, dated `target_date`, if the provider is unreachable."""
    today = date.today()
    if target_date >= today:
        live = get_live_rates()
        return {"date": today.isoformat(), **live}

    cache_key = target_date.isoformat()
    cached = _date_rate_cache.get(cache_key)
    if cached is not None:
        return cached

    settings = get_settings()
    fallback = {
        "date": cache_key,
        "BRL": 1.0,
        "USD": settings.exchange_rate_usd,
        "EUR": settings.exchange_rate_eur,
    }

    fetched = _fetch_rates(target_date)
    if fetched is None:
        return fallback

    _date_rate_cache[cache_key] = fetched
    return fetched


def convert_to_brl(amount: Decimal, currency: Currency, on_date: date) -> tuple[Decimal, Decimal, date]:
    """Converts `amount` (in `currency`) to its BRL equivalent, using the exchange rate
    as of `on_date`. Returns (amount_in_brl, brl_per_unit_rate, rate_date) - the rate
    and its date are the ones actually used, for the caller to persist alongside the
    original amount/currency (spec: transactions carry the FX snapshot from when they
    happened, since a value in BRL today isn't the same value tomorrow)."""
    if currency == Currency.BRL:
        return amount, Decimal("1"), on_date

    rates = get_rate_for_date(on_date)
    foreign_per_brl = Decimal(str(rates[currency.value]))
    brl_per_unit = (Decimal("1") / foreign_per_brl).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
    amount_brl = (amount * brl_per_unit).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    rate_date = date.fromisoformat(str(rates["date"]))
    return amount_brl, brl_per_unit, rate_date
