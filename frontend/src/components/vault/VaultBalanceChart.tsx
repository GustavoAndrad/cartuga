import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import { useMemo } from "react";

import { monthLabel } from "../../charts/monthLabels";
import { labelOf, toMonthIndex } from "../../charts/monthWindow";
import { baseChartOptions, SERIES_COLORS } from "../../charts/theme";
import { useCurrency } from "../../hooks/useCurrency";
import { useMonthWindow } from "../../hooks/useMonthWindow";
import { useTheme } from "../../hooks/useTheme";
import type { VaultMonthPoint } from "../../types";
import { ChartWindowHeader } from "../ChartWindowHeader";

interface VaultBalanceChartProps {
  /** Every month from the first Cofre movement up to the current month. */
  series: VaultMonthPoint[];
}

/** Months visible at once - older history is reached with the arrows. */
const WINDOW_MONTHS = 12;

export function VaultBalanceChart({ series }: VaultBalanceChartProps) {
  const { theme } = useTheme();
  const { format, currency } = useCurrency();

  // The whole series is already loaded, so scrolling is just a different slice of it.
  const first = toMonthIndex(series[0].year, series[0].month);
  const last = toMonthIndex(series[series.length - 1].year, series[series.length - 1].month);
  const size = Math.min(WINDOW_MONTHS, series.length);
  const bounds = useMemo(() => ({ first, last }), [first, last]);
  const messages = useMemo(
    () => ({
      prev: `O Cofre não tem movimentações antes de ${labelOf(first)}.`,
      next: `O gráfico do Cofre vai só até ${labelOf(last)}: movimentações futuras não são projetadas.`,
    }),
    [first, last]
  );
  const nav = useMonthWindow(last - size + 1, size, bounds, messages);
  const points = useMemo(
    () => series.slice(nav.start - first, nav.start - first + size),
    [series, nav.start, first, size]
  );

  const options: Highcharts.Options = useMemo(() => {
    const base = baseChartOptions(theme);
    const categories = points.map((p) => monthLabel(p.year, p.month));

    return {
      ...base,
      chart: { ...base.chart, type: "line", height: 320 },
      xAxis: { ...base.xAxis, categories, crosshair: true },
      yAxis: {
        ...base.yAxis,
        labels: {
          ...base.yAxis.labels,
          formatter() {
            return format(this.value as number);
          },
        },
        plotLines: [{ value: 0, color: base.xAxis.lineColor, width: 1 }],
      },
      legend: { enabled: false },
      tooltip: {
        ...base.tooltip,
        formatter() {
          const point = this as unknown as { x: string; y?: number };
          return `<div style="padding:4px;">
            <div style="font-weight:600;margin-bottom:2px;">${point.x}</div>
            <strong>${format(point.y ?? 0)}</strong>
          </div>`;
        },
      },
      series: [
        {
          type: "line",
          name: "Saldo guardado",
          color: SERIES_COLORS.saldo[theme],
          data: points.map((p) => parseFloat(p.cumulative_balance)),
        },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, theme, currency]);

  return (
    <div>
      <ChartWindowHeader
        title={<h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Variação do saldo guardado</h3>}
        nav={nav}
      />
      <HighchartsReact highcharts={Highcharts} options={options} />
    </div>
  );
}
