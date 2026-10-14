import { useQuery } from "@tanstack/react-query";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import { useMemo, useState } from "react";

import { InfoTooltip } from "../InfoTooltip";
import { ArrowDownIcon, ArrowUpIcon, ExpandIcon } from "../table/icons";
import { CHART_INK, CHART_SURFACE, STATUS_COLORS } from "../../charts/theme";
import { useCurrency } from "../../hooks/useCurrency";
import { useTheme } from "../../hooks/useTheme";
import { getExchangeRateHistory, getExchangeRates } from "../../services/configApi";
import type { Currency } from "../../types";
import { ExchangeRateDetailModal } from "./ExchangeRateDetailModal";

type TrackedCurrency = "USD" | "EUR";

const OPTIONS: { value: TrackedCurrency; label: string }[] = [
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
];

function defaultCurrency(dashboardCurrency: Currency): TrackedCurrency {
  return dashboardCurrency === "EUR" ? "EUR" : "USD";
}

export function ExchangeRateSection() {
  const { theme } = useTheme();
  const { currency: dashboardCurrency } = useCurrency();
  const [selected, setSelected] = useState<TrackedCurrency>(() => defaultCurrency(dashboardCurrency));
  const [detailOpen, setDetailOpen] = useState(false);

  const ratesQuery = useQuery({ queryKey: ["exchange-rates"], queryFn: getExchangeRates });
  const historyQuery = useQuery({
    queryKey: ["exchange-rate-history", 30],
    queryFn: () => getExchangeRateHistory(30),
  });

  const points = historyQuery.data?.points ?? [];
  const selectedPoints = points.map((p) => p[selected]);
  const latest = selectedPoints.at(-1) ?? ratesQuery.data?.rates[selected];
  const previous = selectedPoints.at(-2);
  const delta = latest !== undefined && previous !== undefined ? latest - previous : null;
  const deltaPct = delta !== null && previous ? (delta / previous) * 100 : null;
  const isUp = delta !== null && delta > 0;
  const isDown = delta !== null && delta < 0;
  const trendColor = isUp ? STATUS_COLORS.good[theme] : isDown ? STATUS_COLORS.critical[theme] : undefined;

  const options: Highcharts.Options = useMemo(() => {
    const ink = CHART_INK[theme];
    const surface = CHART_SURFACE[theme];
    const categories = points.map((p) => {
      const [, m, d] = p.date.split("-");
      return `${d}/${m}`;
    });
    const lineColor = theme === "dark" ? "#dff0e1" : "#265c30";

    return {
      chart: { type: "line", height: 40, backgroundColor: "transparent", margin: [4, 2, 4, 2] },
      title: { text: undefined },
      credits: { enabled: false },
      xAxis: { visible: false },
      yAxis: { visible: false, title: { text: undefined } },
      legend: { enabled: false },
      tooltip: {
        backgroundColor: surface,
        borderColor: ink.grid,
        borderRadius: 6,
        style: { color: ink.primary, fontSize: "11px" },
        formatter() {
          const point = this as unknown as Highcharts.Point & { x: number; y: number };
          return `${categories[point.x]}: <b>${point.y.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</b>`;
        },
      },
      plotOptions: {
        series: { animation: false, states: { hover: { lineWidth: 2 } } },
        line: { lineWidth: 1.5, marker: { enabled: false } },
      },
      series: [
        {
          type: "line",
          name: selected,
          color: lineColor,
          data: points.map((p) => p[selected]),
        },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, selected, theme]);

  return (
    <div className="rounded-xl border border-neutral-300 bg-[var(--color-surface)] p-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Câmbio
          </span>
          <InfoTooltip text="Cotação PTAX de fechamento (Banco Central do Brasil), atualizada uma vez por dia útil. Independente do seletor de moeda do topo: mudar aqui não afeta o resto do dashboard." />
        </div>

        <div className="flex overflow-hidden rounded-md border border-neutral-300 text-[11px] dark:border-neutral-700">
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSelected(opt.value)}
              className={`px-2 py-1 font-medium transition-colors ${
                opt.value === selected
                  ? "bg-cartuga-600 text-white"
                  : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {ratesQuery.isLoading ? (
          <span className="text-xs text-neutral-400 dark:text-neutral-500">Carregando...</span>
        ) : (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
              1 {selected} = R${" "}
              {latest ? (1 / latest).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : "-"}
            </span>
            <span className="text-xs text-neutral-400 dark:text-neutral-500">
              (1 BRL = {latest !== undefined ? latest.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : "-"} {selected})
            </span>
            {delta !== null && delta !== 0 && (
              <span className="flex items-center gap-0.5 text-xs font-medium" style={{ color: trendColor }}>
                {isUp ? <ArrowUpIcon className="h-3 w-3" /> : <ArrowDownIcon className="h-3 w-3" />}
                {Math.abs(deltaPct ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
              </span>
            )}
          </div>
        )}

        {points.length > 0 && (
          <div className="ml-auto h-10 w-28 sm:w-36">
            <HighchartsReact highcharts={Highcharts} options={options} />
          </div>
        )}
        {historyQuery.isError && (
          <span className="ml-auto text-xs text-neutral-400 dark:text-neutral-500">Histórico indisponível</span>
        )}

        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          title="Ver detalhes completos"
          aria-label="Ver detalhes completos do câmbio"
          className="flex shrink-0 items-center gap-1 rounded-md border border-neutral-300 px-2 py-1 text-[11px] font-medium text-neutral-500 transition-colors hover:border-cartuga-500 hover:bg-cartuga-50 hover:text-cartuga-700 dark:border-neutral-600 dark:text-neutral-400 dark:hover:bg-cartuga-900/40 dark:hover:text-cartuga-300"
        >
          <ExpandIcon className="h-3 w-3" />
          Ver mais
        </button>
      </div>

      <ExchangeRateDetailModal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        selected={selected}
        onSelectCurrency={setSelected}
      />
    </div>
  );
}
