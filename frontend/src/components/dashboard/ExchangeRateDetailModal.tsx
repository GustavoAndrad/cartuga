import { useQuery } from "@tanstack/react-query";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import { useMemo, useState } from "react";

import { Modal } from "../Modal";
import { ArrowDownIcon, ArrowUpIcon } from "../table/icons";
import { baseChartOptions, SERIES_COLORS } from "../../charts/theme";
import { useTheme } from "../../hooks/useTheme";
import { getExchangeRateHistory, getExchangeRates } from "../../services/configApi";
import type { Currency } from "../../types";

type TrackedCurrency = "USD" | "EUR";

const PERIODS = [
  { value: 7, label: "7d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
];

interface ExchangeRateDetailModalProps {
  open: boolean;
  onClose: () => void;
  selected: TrackedCurrency;
  onSelectCurrency: (currency: TrackedCurrency) => void;
}

function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

export function ExchangeRateDetailModal({ open, onClose, selected, onSelectCurrency }: ExchangeRateDetailModalProps) {
  const { theme } = useTheme();
  const [days, setDays] = useState(30);

  const ratesQuery = useQuery({ queryKey: ["exchange-rates"], queryFn: getExchangeRates, enabled: open });
  const historyQuery = useQuery({
    queryKey: ["exchange-rate-history", days],
    queryFn: () => getExchangeRateHistory(days),
    enabled: open,
  });

  const points = historyQuery.data?.points ?? [];
  const values = points.map((p) => p[selected]);
  const latest = values.at(-1) ?? ratesQuery.data?.rates[selected as Currency];
  const first = values[0];
  const delta = latest !== undefined && first !== undefined ? latest - first : null;
  const deltaPct = delta !== null && first ? (delta / first) * 100 : null;
  const isUp = delta !== null && delta > 0;
  const isDown = delta !== null && delta < 0;
  const inverseValues = values.map((v) => 1 / v);
  const maxInverse = inverseValues.length > 0 ? Math.max(...inverseValues) : null;
  const minInverse = inverseValues.length > 0 ? Math.min(...inverseValues) : null;

  const options: Highcharts.Options = useMemo(() => {
    const base = baseChartOptions(theme);
    const categories = points.map((p) => {
      const [, m, d] = p.date.split("-");
      return `${d}/${m}`;
    });

    return {
      ...base,
      chart: { ...base.chart, type: "line", height: 320 },
      xAxis: { ...base.xAxis, categories, crosshair: true },
      yAxis: {
        ...base.yAxis,
        labels: {
          ...base.yAxis.labels,
          formatter() {
            return formatBRL(this.value as number);
          },
        },
      },
      legend: { enabled: false },
      tooltip: {
        ...base.tooltip,
        formatter() {
          const point = this as unknown as { x: string; y: number };
          return `<div style="padding:4px;">
            <div style="font-weight:600;margin-bottom:2px;">${point.x}</div>
            <strong>1 ${selected} = ${formatBRL(point.y)}</strong>
          </div>`;
        },
      },
      series: [
        {
          type: "line",
          name: selected,
          color: SERIES_COLORS.saldo[theme],
          data: inverseValues,
        },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, inverseValues, selected, theme]);

  return (
    <Modal open={open} onClose={onClose} title="Câmbio" size="xl">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex overflow-hidden rounded-lg border border-neutral-300 dark:border-neutral-700">
            {(["USD", "EUR"] as TrackedCurrency[]).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => onSelectCurrency(opt)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  opt === selected
                    ? "bg-cartuga-600 text-white"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>

          <div className="flex overflow-hidden rounded-lg border border-neutral-300 dark:border-neutral-700">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setDays(p.value)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  p.value === days
                    ? "bg-cartuga-600 text-white"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-cartuga-50 p-4 text-center dark:bg-cartuga-900/30">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Cotação atual
            </p>
            <p className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
              {latest !== undefined ? formatBRL(1 / latest) : "-"}
            </p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              1 {selected} · 1 BRL = {latest !== undefined ? latest.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : "-"} {selected}
            </p>
          </div>
          <div className="rounded-xl bg-neutral-50 p-4 text-center dark:bg-neutral-800/60">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Variação no período
            </p>
            <p
              className={`mt-1 flex items-center justify-center gap-1 text-lg font-semibold ${
                isUp
                  ? "text-cartuga-700 dark:text-cartuga-400"
                  : isDown
                    ? "text-red-600 dark:text-red-400"
                    : "text-neutral-900 dark:text-neutral-50"
              }`}
            >
              {isUp && <ArrowUpIcon className="h-4 w-4" />}
              {isDown && <ArrowDownIcon className="h-4 w-4" />}
              {deltaPct !== null ? `${Math.abs(deltaPct).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : "-"}
            </p>
          </div>
          <div className="rounded-xl bg-neutral-50 p-4 text-center dark:bg-neutral-800/60">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Máxima no período
            </p>
            <p className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
              {maxInverse !== null ? formatBRL(maxInverse) : "-"}
            </p>
          </div>
          <div className="rounded-xl bg-neutral-50 p-4 text-center dark:bg-neutral-800/60">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Mínima no período
            </p>
            <p className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
              {minInverse !== null ? formatBRL(minInverse) : "-"}
            </p>
          </div>
        </div>

        {points.length > 0 ? (
          <HighchartsReact highcharts={Highcharts} options={options} />
        ) : (
          <p className="text-sm text-neutral-400 dark:text-neutral-500">Histórico indisponível.</p>
        )}
      </div>
    </Modal>
  );
}
