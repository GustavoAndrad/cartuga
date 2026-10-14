from datetime import date

from fastapi import APIRouter, Depends, Query

from app.auth.dependencies import get_current_user
from app.config import get_settings
from app.services import exchange_rate_service
from app.utils.errors import ServiceUnavailableError

router = APIRouter(prefix="/config", tags=["config"], dependencies=[Depends(get_current_user)])
settings = get_settings()


@router.get("/exchange-rates")
def get_exchange_rates():
    """Live BRL exchange rates (Banco Central do Brasil PTAX), for display-only conversion.

    BRL is always the stored/base currency; the frontend uses these rates purely to
    render amounts in another currency, never to mutate stored values. Falls back to
    the static env-configured rates if the live provider is unreachable.
    """
    return {"base": "BRL", "rates": exchange_rate_service.get_live_rates()}


@router.get("/exchange-rates/date/{on_date}")
def get_exchange_rate_for_date(on_date: date):
    """BRL exchange rates as of a specific past date (PTAX closing/"venda") - for
    showing what a stored amount was actually worth in another currency back then,
    never today's rate. `date` in the response is the rate's actual date (the closest
    prior business day, if `on_date` had none published). Same static fallback as the
    live endpoint above if the provider is unreachable.
    """
    rates = dict(exchange_rate_service.get_rate_for_date(on_date))
    rate_date = rates.pop("date")
    return {"base": "BRL", "date": rate_date, "rates": rates}


@router.get("/exchange-rates/history")
def get_exchange_rate_history(days: int = Query(30, ge=2, le=90)):
    """Daily BRL exchange rate history for the last `days` days, for the dashboard's
    fluctuation chart. No fallback exists for this one (there's no static history to
    fall back to) - returns 503 if the live provider is unreachable.
    """
    points = exchange_rate_service.get_rate_history(days)
    if points is None:
        raise ServiceUnavailableError("Não foi possível carregar o histórico de câmbio no momento.")
    return {"base": "BRL", "points": points}
