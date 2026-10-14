import { useQuery } from "@tanstack/react-query";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import { useMemo } from "react";

import { Modal } from "./Modal";
import { ErrorState } from "./ErrorState";
import { Spinner } from "./Spinner";
import { monthFull, monthLabel } from "../charts/monthLabels";
import { baseChartOptions, SERIES_COLORS } from "../charts/theme";
import { useCurrency } from "../hooks/useCurrency";
import { useTheme } from "../hooks/useTheme";
import { getEntryImpact } from "../services/entriesApi";
import { getExpenseImpact } from "../services/expensesApi";

interface ImpactModalProps {
  open: boolean;
  onClose: () => void;
  kind: "entry" | "expense";
  id: number;
  description: string;
}

function monthIndex(year: number, month: number): number {
  return year * 12 + month;
}

export function ImpactModal({ open, onClose, kind, id, description }: ImpactModalProps) {
  const { theme } = useTheme();
  const { format, currency } = useCurrency();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [kind === "entry" ? "entries" : "expenses", id, "impact"],
    queryFn: () => (kind === "entry" ? getEntryImpact(id) : getExpenseImpact(id)),
    enabled: open,
  });

  const options: Highcharts.Options = useMemo(() => {
    if (!data) return {};
    const base = baseChartOptions(theme);
    const categories = data.points.map((p) => monthLabel(p.year, p.month));

    const todayIdx = data.points.findIndex((p) => p.is_projected);
    const projectionStartIndex = todayIdx === -1 ? data.points.length - 1 : todayIdx - 1;

    const activeUntilIdx =
      data.active_until_year !== null && data.active_until_month !== null
        ? data.points.findIndex(
            (p) => p.year === data.active_until_year && p.month === data.active_until_month
          )
        : data.points.length - 1;

    return {
      ...base,
      chart: { ...base.chart, type: "line", height: 340 },
      xAxis: {
        ...base.xAxis,
        categories,
        crosshair: true,
        plotBands:
          activeUntilIdx >= 0
            ? [
                {
                  from: -0.5,
                  to: activeUntilIdx + 0.5,
                  color: theme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
                  label: {
                    text: "período ativo",
                    style: { color: base.xAxis.labels.style.color, fontSize: "10px" },
                    y: 12,
                  },
                },
              ]
            : undefined,
      },
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
          const pts = point.points ?? [];
          const withPt = pts.find((p) => p.series.name === "Com este registro");
          const withoutPt = pts.find((p) => p.series.name === "Sem este registro");
          const impact = (withPt?.y ?? 0) - (withoutPt?.y ?? 0);
          const rows = pts
            .map((p) => {
              const color = p.color as string;
              return `<div style="display:flex;align-items:center;gap:6px;margin-top:2px;">
                <span style="display:inline-block;width:10px;height:2px;background:${color};"></span>
                <strong>${format(p.y ?? 0)}</strong>
                <span style="opacity:0.7;">${p.series.name}</span>
              </div>`;
            })
            .join("");
          return `<div style="padding:4px;">
            <div style="font-weight:600;margin-bottom:2px;">${point.x}</div>
            ${rows}
            <div style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(128,128,128,0.3);">
              Impacto: <strong>${format(impact)}</strong>
            </div>
          </div>`;
        },
      },
      plotOptions: {
        ...base.plotOptions,
        line: { ...base.plotOptions.line, marker: { enabled: false } },
      },
      series: [
        {
          type: "line",
          name: "Com este registro",
          color: SERIES_COLORS.saldo[theme],
          data: data.points.map((p) => parseFloat(p.cumulative_with)),
          zoneAxis: "x",
          zones:
            projectionStartIndex >= 0
              ? [
                  { value: projectionStartIndex, color: SERIES_COLORS.saldo[theme] },
                  { dashStyle: "ShortDash", color: SERIES_COLORS.saldo[theme] },
                ]
              : undefined,
        },
        {
          type: "line",
          name: "Sem este registro",
          color: theme === "dark" ? "#898781" : "#898781",
          dashStyle: "Dash",
          data: data.points.map((p) => parseFloat(p.cumulative_without)),
        },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, theme, currency]);

  const currentImpact = useMemo(() => {
    if (!data) return null;
    const idx = data.points.findIndex((p) => p.is_projected);
    const point = idx === -1 ? data.points.at(-1) : data.points[Math.max(0, idx - 1)];
    return point ? parseFloat(point.cumulative_impact) : null;
  }, [data]);

  const finalImpact = data?.points.at(-1) ? parseFloat(data.points.at(-1)!.cumulative_impact) : null;

  const activeUntilLabel =
    data && data.active_until_year !== null && data.active_until_month !== null
      ? `${monthFull(data.active_until_month).toLowerCase()} de ${data.active_until_year}`
      : null;

  const isStillActive =
    data &&
    (data.is_indefinite ||
      (data.active_until_year !== null &&
        monthIndex(data.active_until_year, data.active_until_month!) >=
          monthIndex(new Date().getFullYear(), new Date().getMonth() + 1)));

  return (
    <Modal open={open} onClose={onClose} title={`Impacto de "${description}"`} size="xl">
      {isLoading && <Spinner label="Calculando impacto..." />}
      {isError && <ErrorState message="Não foi possível calcular o impacto." onRetry={() => refetch()} />}

      {data && (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Comparação entre o saldo acumulado real e o que ele seria se este registro nunca tivesse existido.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-neutral-50 p-4 text-center dark:bg-neutral-800/60">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Ativo desde
              </p>
              <p className="mt-1 text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                {monthFull(data.active_from_month)} de {data.active_from_year}
              </p>
            </div>
            <div className="rounded-xl bg-neutral-50 p-4 text-center dark:bg-neutral-800/60">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                {data.is_indefinite ? "Sem data de término" : "Até"}
              </p>
              <p className="mt-1 text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                {data.is_indefinite
                  ? `em andamento (mostrando até ${monthFull(data.horizon_month).toLowerCase()} de ${data.horizon_year})`
                  : activeUntilLabel}
              </p>
            </div>
            <div className="rounded-xl bg-cartuga-50 p-4 text-center dark:bg-cartuga-900/30">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Impacto acumulado hoje
              </p>
              <p className="mt-1 text-sm font-semibold text-cartuga-700 dark:text-cartuga-300">
                {currentImpact !== null ? format(currentImpact) : "-"}
              </p>
            </div>
          </div>

          {isStillActive && finalImpact !== null && currentImpact !== null && finalImpact !== currentImpact && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Se continuar como está, o impacto acumulado chega a{" "}
              <span className="font-semibold text-neutral-700 dark:text-neutral-200">{format(finalImpact)}</span> até{" "}
              {monthFull(data.horizon_month)} de {data.horizon_year}
              {data.is_indefinite ? " (limite de projeção do sistema)" : ""}.
            </p>
          )}

          <HighchartsReact highcharts={Highcharts} options={options} />
        </div>
      )}
    </Modal>
  );
}
