import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import { useMemo } from "react";

import { monthLabel } from "../../charts/monthLabels";
import { baseChartOptions, SERIES_COLORS } from "../../charts/theme";
import { useChartWindow, type ChartWindowSource } from "../../hooks/useChartWindow";
import { useCurrency } from "../../hooks/useCurrency";
import { useTheme } from "../../hooks/useTheme";
import { getPlannedComparisonWindow } from "../../services/planningApi";
import type { PlannedComparison } from "../../types";
import { ChartWindowHeader } from "../ChartWindowHeader";

interface PlannedChartProps {
  source: ChartWindowSource<PlannedComparison>;
}

function usePlannedComparisonWindow(source: ChartWindowSource<PlannedComparison>) {
  return useChartWindow({
    queryKey: ["planning", "comparison", "window"],
    fetchWindow: getPlannedComparisonWindow,
    ...source,
  });
}

export function PlannedBalanceChart({ source }: PlannedChartProps) {
  const { theme } = useTheme();
  const { format, currency } = useCurrency();
  const { nav, data: comparison, isLoading, isError } = usePlannedComparisonWindow(source);

  const options: Highcharts.Options = useMemo(() => {
    const base = baseChartOptions(theme);
    const categories = comparison.points.map((p) => monthLabel(p.year, p.month));
    // Dashed from the last real month onwards. -1 = no projected month in this window
    // (all solid); 0 = the window is entirely projected (all dashed).
    const firstProjectedIdx = comparison.points.findIndex((p) => p.is_projected);

    return {
      ...base,
      chart: { ...base.chart, type: "line", height: 280 },
      xAxis: { ...base.xAxis, categories, crosshair: true },
      yAxis: {
        ...base.yAxis,
        labels: {
          ...base.yAxis.labels,
          formatter(this: Highcharts.AxisLabelsFormatterContextObject) {
            return format(this.value as number);
          },
        },
        plotLines: [{ value: 0, color: base.xAxis.lineColor, width: 1 }],
      },
      tooltip: {
        ...base.tooltip,
        formatter() {
          const point = this as unknown as { points?: Highcharts.Point[]; x: string };
          const rows = (point.points ?? [])
            .map((p) => {
              const color = p.color as string;
              return `<div style="display:flex;align-items:center;gap:6px;margin-top:2px;">
                <span style="display:inline-block;width:10px;height:2px;background:${color};"></span>
                <strong>${format(p.y ?? 0)}</strong>
                <span style="opacity:0.7;">${p.series.name}</span>
              </div>`;
            })
            .join("");
          return `<div style="padding:4px;"><div style="font-weight:600;margin-bottom:2px;">${point.x}</div>${rows}</div>`;
        },
      },
      series: [
        {
          type: "line",
          name: "Com planejados",
          color: SERIES_COLORS.saldo[theme],
          data: comparison.points.map((p) => parseFloat(p.cumulative_with_planned)),
          zoneAxis: "x",
          zones:
            firstProjectedIdx !== -1
              ? [
                  { value: firstProjectedIdx - 1, color: SERIES_COLORS.saldo[theme] },
                  { dashStyle: "ShortDash", color: SERIES_COLORS.saldo[theme] },
                ]
              : undefined,
        },
        {
          type: "line",
          name: "Sem planejados",
          color: "#898781",
          dashStyle: "Dash",
          data: comparison.points.map((p) => parseFloat(p.cumulative_without_planned)),
        },
      ],
      plotOptions: {
        ...base.plotOptions,
        line: { ...base.plotOptions.line, marker: { enabled: false } },
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparison, theme, currency]);

  return (
    <div>
      <ChartWindowHeader
        title={<h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Saldo acumulado</h3>}
        nav={nav}
        isLoading={isLoading}
        isError={isError}
      />
      <HighchartsReact highcharts={Highcharts} options={options} />
    </div>
  );
}

interface PlannedMonthlyChartProps extends PlannedChartProps {
  kind: "entries" | "expenses";
}

export function PlannedMonthlyChart({ source, kind }: PlannedMonthlyChartProps) {
  const { theme } = useTheme();
  const { format, currency } = useCurrency();
  const { nav, data: comparison, isLoading, isError } = usePlannedComparisonWindow(source);

  const options: Highcharts.Options = useMemo(() => {
    const base = baseChartOptions(theme);
    const categories = comparison.points.map((p) => monthLabel(p.year, p.month));
    const confirmedColor = kind === "entries" ? SERIES_COLORS.entradas[theme] : SERIES_COLORS.saidas[theme];
    const plannedColor = theme === "dark" ? "#c98500" : "#eda100";

    const totalKey = kind === "entries" ? "entries_total" : "expenses_total";
    const plannedKey = kind === "entries" ? "planned_entries_total" : "planned_expenses_total";

    const confirmedData = comparison.points.map((p) => parseFloat(p[totalKey]) - parseFloat(p[plannedKey]));
    const plannedData = comparison.points.map((p) => parseFloat(p[plannedKey]));

    return {
      ...base,
      chart: { ...base.chart, type: "column", height: 240 },
      xAxis: { ...base.xAxis, categories },
      yAxis: {
        ...base.yAxis,
        labels: {
          ...base.yAxis.labels,
          formatter(this: Highcharts.AxisLabelsFormatterContextObject) {
            return format(this.value as number);
          },
        },
      },
      legend: { ...base.legend, enabled: true },
      tooltip: {
        ...base.tooltip,
        formatter() {
          const point = this as unknown as { points?: Highcharts.Point[]; x: string };
          const rows = (point.points ?? [])
            .map((p) => {
              const color = p.color as string;
              return `<div style="display:flex;align-items:center;gap:6px;margin-top:2px;">
                <span style="display:inline-block;width:10px;height:10px;background:${color};border-radius:2px;"></span>
                <strong>${format(p.y ?? 0)}</strong>
                <span style="opacity:0.7;">${p.series.name}</span>
              </div>`;
            })
            .join("");
          return `<div style="padding:4px;"><div style="font-weight:600;margin-bottom:2px;">${point.x}</div>${rows}</div>`;
        },
      },
      plotOptions: {
        ...base.plotOptions,
        column: { ...base.plotOptions.column, stacking: "normal" },
      },
      series: [
        { type: "column", name: "Confirmado", color: confirmedColor, data: confirmedData },
        { type: "column", name: "Planejado", color: plannedColor, data: plannedData },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparison, kind, theme, currency]);

  return (
    <div>
      <ChartWindowHeader
        title={
          <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
            {kind === "entries" ? "Entradas por mês" : "Saídas por mês"}
          </h3>
        }
        nav={nav}
        isLoading={isLoading}
        isError={isError}
      />
      <HighchartsReact highcharts={Highcharts} options={options} />
    </div>
  );
}
