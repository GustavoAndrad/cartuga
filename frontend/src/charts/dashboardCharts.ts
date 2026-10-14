/**
 * Highcharts options for every dashboard chart, as pure functions of their data.
 * Shared by the live dashboard and the exported PDF report, so the report draws
 * exactly what the dashboard draws - same series, colors and scales.
 */
import type Highcharts from "highcharts";

import { monthLabel } from "./monthLabels";
import { baseChartOptions, categoricalColor, SERIES_COLORS, STATUS_COLORS, type ThemeMode } from "./theme";
import type { DistributionItem, MonthPoint } from "../types";
import { escapeHtml } from "../utils/escapeHtml";

export interface ChartContext {
  theme: ThemeMode;
  /** BRL -> display currency. Values are converted before charting (not just when
   * labelled), so axis ticks land on round numbers of the display currency. */
  convert: (amountBRL: number) => number;
  /** Formats an amount that is already in the display currency. */
  format: (amount: number) => string;
  height?: number;
  /** Static rendering for the PDF: no animation, tooltips or click handling. */
  print?: boolean;
  selected?: { year: number; month: number } | null;
  onSelectMonth?: (year: number, month: number) => void;
}

export type DistributionGroup = "by_source" | "by_type";

const MAX_SLICES = 6;
const TYPE_LABELS: Record<string, string> = { FIXED: "Fixa", EXCEPTIONAL: "Excepcional" };

function isSelected(ctx: ChartContext, p: MonthPoint): boolean {
  return !!ctx.selected && ctx.selected.year === p.year && ctx.selected.month === p.month;
}

/** Shared chrome: base theme, money-formatted y axis, print/interactive behavior. */
function frame(ctx: ChartContext, type: "line" | "column", height: number): Highcharts.Options {
  const base = baseChartOptions(ctx.theme);
  return {
    ...base,
    chart: { ...base.chart, type, height: ctx.height ?? height, animation: !ctx.print },
    yAxis: {
      ...base.yAxis,
      labels: {
        ...base.yAxis.labels,
        formatter() {
          return ctx.format(this.value as number);
        },
      },
    },
    tooltip: { ...base.tooltip, enabled: !ctx.print },
    plotOptions: {
      ...base.plotOptions,
      series: {
        ...base.plotOptions.series,
        animation: ctx.print ? false : base.plotOptions.series.animation,
        enableMouseTracking: !ctx.print,
        cursor: ctx.onSelectMonth ? "pointer" : undefined,
        point: {
          events: {
            click() {
              const custom = (this as unknown as { custom?: { year: number; month: number } }).custom;
              if (custom) ctx.onSelectMonth?.(custom.year, custom.month);
            },
          },
        },
      },
    },
  } as Highcharts.Options;
}

function sharedLineTooltip(ctx: ChartContext): Highcharts.TooltipOptions["formatter"] {
  return function () {
    const point = this as unknown as { points?: Highcharts.Point[]; x: string };
    const rows = (point.points ?? [])
      .map((p) => {
        const color = p.color as string;
        return `<div style="display:flex;align-items:center;gap:6px;margin-top:2px;">
          <span style="display:inline-block;width:10px;height:2px;background:${color};"></span>
          <strong>${ctx.format(p.y ?? 0)}</strong>
          <span style="opacity:0.7;">${p.series.name}</span>
        </div>`;
      })
      .join("");
    return `<div style="padding:4px;"><div style="font-weight:600;margin-bottom:2px;">${point.x}</div>${rows}</div>`;
  };
}

/** "Entradas e Saídas por mês". */
export function timeSeriesOptions(points: MonthPoint[], ctx: ChartContext): Highcharts.Options {
  const opts = frame(ctx, "line", 320);
  const seriesData = (field: "entries_total" | "expenses_total") =>
    points.map((p) => ({
      y: ctx.convert(parseFloat(p[field])),
      custom: { year: p.year, month: p.month },
      marker: isSelected(ctx, p) ? { radius: 6, lineWidth: 2, lineColor: "#fff" } : undefined,
    }));

  return {
    ...opts,
    xAxis: { ...baseChartOptions(ctx.theme).xAxis, categories: points.map((p) => monthLabel(p.year, p.month)), crosshair: true },
    tooltip: { ...opts.tooltip, formatter: sharedLineTooltip(ctx) },
    series: [
      { type: "line", name: "Entradas", color: SERIES_COLORS.entradas[ctx.theme], data: seriesData("entries_total") },
      { type: "line", name: "Saídas", color: SERIES_COLORS.saidas[ctx.theme], data: seriesData("expenses_total") },
    ],
  };
}

/** "Saldo mensal". */
export function balanceLineOptions(points: MonthPoint[], ctx: ChartContext): Highcharts.Options {
  const opts = frame(ctx, "line", 320);
  const base = baseChartOptions(ctx.theme);
  return {
    ...opts,
    xAxis: { ...base.xAxis, categories: points.map((p) => monthLabel(p.year, p.month)), crosshair: true },
    yAxis: { ...(opts.yAxis as Highcharts.YAxisOptions), plotLines: [{ value: 0, color: base.xAxis.lineColor, width: 1 }] },
    legend: { enabled: false },
    tooltip: {
      ...opts.tooltip,
      formatter() {
        const point = this as unknown as { x: string; y?: number };
        return `<div style="padding:4px;">
          <div style="font-weight:600;margin-bottom:2px;">${point.x}</div>
          <strong>${ctx.format(point.y ?? 0)}</strong>
        </div>`;
      },
    },
    series: [
      {
        type: "line",
        name: "Saldo do mês",
        color: SERIES_COLORS.saldo[ctx.theme],
        data: points.map((p) => ({
          y: ctx.convert(parseFloat(p.balance)),
          custom: { year: p.year, month: p.month },
          marker: isSelected(ctx, p) ? { radius: 6, lineWidth: 2, lineColor: "#fff" } : undefined,
        })),
      },
    ],
  };
}

function withOpacity(hex: string, opacity: number): string {
  const alpha = Math.round(opacity * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${alpha}`;
}

/** "Saldo acumulado por mês" - projected months at half opacity. */
export function cumulativeBalanceOptions(points: MonthPoint[], ctx: ChartContext): Highcharts.Options {
  const opts = frame(ctx, "column", 320);
  const base = baseChartOptions(ctx.theme);
  const data = points.map((p) => {
    const statusColor = parseFloat(p.cumulative_balance) >= 0 ? STATUS_COLORS.good[ctx.theme] : STATUS_COLORS.critical[ctx.theme];
    const selected = isSelected(ctx, p);
    return {
      y: ctx.convert(parseFloat(p.cumulative_balance)),
      color: withOpacity(statusColor, p.is_projected ? 0.5 : 1),
      borderColor: selected ? statusColor : undefined,
      borderWidth: selected ? 2 : 0,
      custom: { year: p.year, month: p.month, isProjected: p.is_projected, label: monthLabel(p.year, p.month) },
    };
  });

  return {
    ...opts,
    xAxis: { ...base.xAxis, categories: points.map((p) => monthLabel(p.year, p.month)), crosshair: false },
    yAxis: { ...(opts.yAxis as Highcharts.YAxisOptions), plotLines: [{ value: 0, color: base.xAxis.lineColor, width: 1 }] },
    legend: { enabled: false },
    tooltip: {
      ...opts.tooltip,
      shared: false,
      formatter() {
        // Highcharts can invoke the tooltip formatter outside a normal point hover
        // (e.g. its accessibility module probing points on setup), where `custom`
        // isn't populated - guard rather than crash in that case.
        const point = this as unknown as Highcharts.Point & { custom?: { isProjected: boolean; label: string } };
        if (point.y === undefined || !point.custom) return false;
        const suffix = point.custom.isProjected ? " (projetado)" : "";
        return `<div style="padding:4px;">
          <div style="font-weight:600;margin-bottom:2px;">${point.custom.label}${suffix}</div>
          <strong>${ctx.format(point.y ?? 0)}</strong>
        </div>`;
      },
    },
    series: [{ type: "column", name: "Saldo acumulado", data }],
  };
}

/** Pie slices: the biggest MAX_SLICES groups, the rest folded into "Outros". */
export function distributionSlices(
  items: DistributionItem[],
  groupBy: DistributionGroup,
  theme: ThemeMode,
  convert: (amountBRL: number) => number
) {
  const sorted = [...items].sort((a, b) => parseFloat(b.total) - parseFloat(a.total));
  const head = sorted.slice(0, MAX_SLICES);
  const tail = sorted.slice(MAX_SLICES);
  const slices = head.map((item, idx) => ({
    name: groupBy === "by_type" ? (TYPE_LABELS[item.label] ?? item.label) : item.label,
    y: convert(parseFloat(item.total)),
    color: categoricalColor(idx, theme),
  }));
  if (tail.length > 0) {
    slices.push({
      name: "Outros",
      y: convert(tail.reduce((sum, i) => sum + parseFloat(i.total), 0)),
      color: categoricalColor(MAX_SLICES, theme),
    });
  }
  return slices;
}

/** "Distribuição das Entradas/Saídas". */
export function distributionOptions(
  title: string,
  items: DistributionItem[],
  groupBy: DistributionGroup,
  ctx: ChartContext
): Highcharts.Options {
  const { theme, format } = ctx;
  return {
    chart: { type: "pie", height: ctx.height ?? 280, backgroundColor: "transparent", animation: !ctx.print },
    title: { text: undefined },
    credits: { enabled: false },
    tooltip: {
      enabled: !ctx.print,
      useHTML: true,
      formatter() {
        // The formatter's `this` is a tooltip context object, not the Point itself -
        // the point (and its Highcharts-computed `percentage`) lives at `this.point`.
        const point = (this as unknown as Highcharts.TooltipFormatterContextObject).point as Highcharts.Point & {
          percentage?: number;
        };
        const pct = (point.percentage ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        // point.name traces back to a user-typed source label - this tooltip is
        // rendered via useHTML, so it must be escaped by hand (Highcharts doesn't
        // escape for us here the way its own SVG text rendering does elsewhere).
        return `<div style="padding:2px;"><strong>${format(point.y ?? 0)}</strong> <span style="opacity:0.7;">(${pct}%) ${escapeHtml(point.name)}</span></div>`;
      },
    },
    legend: {
      itemStyle: { color: theme === "dark" ? "#c3c2b7" : "#52514e", fontWeight: "500", fontSize: "12px" },
    },
    plotOptions: {
      pie: {
        animation: !ctx.print,
        enableMouseTracking: !ctx.print,
        borderWidth: 2,
        borderColor: theme === "dark" ? "#171717" : "#ffffff",
        dataLabels: { enabled: false },
        showInLegend: true,
      },
    },
    series: [{ type: "pie", name: title, data: distributionSlices(items, groupBy, theme, ctx.convert) }],
  };
}
