/** Chart color roles and shared Highcharts styling, per the dataviz skill.
 *
 * Categorical hues are the skill's validated reference-palette order (kept
 * as-is; brand identity lives in the UI chrome, not in chart series hues).
 * Validated with scripts/validate_palette.js against Cartuga's chart
 * surfaces (#ffffff light / #17301d dark at the time) - all hard gates pass;
 * a few slots sit under 3:1 contrast, mitigated by always keeping a legend +
 * tooltip (the skill's "relief rule") rather than ever using these hues as
 * text. The dark surface later moved to #171717 (still near-black, same
 * luminance range) - not re-run, but contrast gates aren't expected to flip.
 */

export type ThemeMode = "light" | "dark";

const CATEGORICAL_LIGHT = [
  "#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948",
];
const CATEGORICAL_DARK = [
  "#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767",
];

export function categoricalColor(index: number, mode: ThemeMode): string {
  const palette = mode === "dark" ? CATEGORICAL_DARK : CATEGORICAL_LIGHT;
  return palette[index % palette.length];
}

// Fixed series->hue mapping, used everywhere entradas/saídas/saldo appear together.
export const SERIES_COLORS = {
  entradas: { light: "#008300", dark: "#008300" }, // categorical slot 6 (green)
  saidas: { light: "#e34948", dark: "#e66767" }, // categorical slot 8 (red)
  saldo: { light: "#2a78d6", dark: "#3987e5" }, // categorical slot 1 (blue)
};

// Fixed status palette (never themed/re-derived) - used for the balance-sign bars.
export const STATUS_COLORS = {
  good: { light: "#0ca30c", dark: "#0ca30c" },
  critical: { light: "#d03b3b", dark: "#d03b3b" },
};

export const CHART_INK = {
  light: { primary: "#0b0b0b", secondary: "#52514e", muted: "#898781", grid: "#e1e0d9", axis: "#c3c2b7" },
  dark: { primary: "#ffffff", secondary: "#c3c2b7", muted: "#898781", grid: "#2c2c2a", axis: "#383835" },
};

export const CHART_SURFACE = { light: "#ffffff", dark: "#171717" };

const FONT_FAMILY = "system-ui, -apple-system, 'Segoe UI', sans-serif";

export function baseChartOptions(mode: ThemeMode) {
  const ink = CHART_INK[mode];
  const surface = CHART_SURFACE[mode];

  return {
    chart: {
      backgroundColor: "transparent",
      style: { fontFamily: FONT_FAMILY },
    },
    title: { text: undefined },
    credits: { enabled: false },
    colors: mode === "dark" ? CATEGORICAL_DARK : CATEGORICAL_LIGHT,
    xAxis: {
      lineColor: ink.axis,
      tickColor: ink.axis,
      labels: { style: { color: ink.muted, fontSize: "11px" } },
      gridLineColor: ink.grid,
    },
    yAxis: {
      gridLineColor: ink.grid,
      gridLineWidth: 1,
      lineWidth: 0,
      labels: { style: { color: ink.muted, fontSize: "11px" } },
      title: { text: undefined },
    },
    legend: {
      itemStyle: { color: ink.secondary, fontWeight: "500", fontSize: "12px" },
      itemHoverStyle: { color: ink.primary },
      squareSymbol: true,
      symbolRadius: 2,
    },
    tooltip: {
      backgroundColor: surface,
      borderColor: ink.grid,
      borderRadius: 8,
      style: { color: ink.primary, fontSize: "12px" },
      shared: true,
      useHTML: true,
    },
    plotOptions: {
      series: {
        animation: { duration: 300 },
      },
      line: { lineWidth: 2, marker: { radius: 4, symbol: "circle" } },
      column: { borderRadius: 4, borderWidth: 0 },
      pie: {
        borderWidth: 2,
        borderColor: surface,
        dataLabels: { style: { color: ink.secondary, fontSize: "11px", textOutline: "none" } },
      },
    },
  };
}
