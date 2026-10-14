import type { DistributionGroup } from "../../charts/dashboardCharts";
import { monthFull } from "../../charts/monthLabels";
import { fromMonthIndex, labelOf, toMonthIndex } from "../../charts/monthWindow";
import type { Currency, NavigableRange } from "../../types";

/** Months of history the dashboard always shows before the current one. */
export const DASHBOARD_HISTORY_MONTHS = 6;

export type ReportChart = "timeSeries" | "balance" | "cumulative";

export const CHART_TITLES: Record<ReportChart, string> = {
  timeSeries: "Entradas e saídas por mês",
  balance: "Saldo mensal",
  cumulative: "Saldo acumulado por mês",
};

export interface DashboardExportConfig {
  /** Same meaning as the dashboard's "Projeção" selector. */
  projectionMonths: number;
  /** First month shown by each chart (see toMonthIndex). */
  windows: Record<ReportChart, number>;
  distribution: { entries: DistributionGroup; expenses: DistributionGroup };
  currency: Currency;
  sections: {
    summary: boolean;
    charts: Record<ReportChart, boolean>;
    distributions: boolean;
    monthItems: boolean;
  };
}

export function currentMonthIndex(): number {
  const now = new Date();
  return toMonthIndex(now.getFullYear(), now.getMonth() + 1);
}

/** Months each chart shows - fixed by the projection length, like on the dashboard. */
export function windowSize(projectionMonths: number): number {
  return DASHBOARD_HISTORY_MONTHS + 1 + projectionMonths;
}

export function defaultWindowStart(): number {
  return currentMonthIndex() - DASHBOARD_HISTORY_MONTHS;
}

export function defaultWindows(): Record<ReportChart, number> {
  const start = defaultWindowStart();
  return { timeSeries: start, balance: start, cumulative: start };
}

export function monthLong(index: number): string {
  const { year, month } = fromMonthIndex(index);
  return `${monthFull(month).toLowerCase()} de ${year}`;
}

export const GROUP_LABEL: Record<DistributionGroup, string> = { by_source: "por fonte", by_type: "por tipo" };

export const CURRENCY_LABEL: Record<Currency, string> = {
  BRL: "Real (BRL)",
  USD: "Dólar (USD)",
  EUR: "Euro (EUR)",
};

export interface DescriptionLine {
  label: string;
  value: string;
}

/** Plain-language description of everything the export applies - shown in the
 * confirmation modal and printed on the report's first page, so the PDF explains
 * itself without the app. */
export function describeConfig(config: DashboardExportConfig, rates: Record<Currency, number>): DescriptionLine[] {
  const current = currentMonthIndex();
  const size = windowSize(config.projectionMonths);
  const lines: DescriptionLine[] = [
    { label: "Mês de referência", value: monthLong(current) },
    {
      label: "Projeção",
      value: `${config.projectionMonths} ${config.projectionMonths === 1 ? "mês" : "meses"} à frente, até ${monthLong(
        current + config.projectionMonths
      )} (base do card "Saldo projetado")`,
    },
  ];

  (Object.keys(CHART_TITLES) as ReportChart[]).forEach((chart) => {
    if (!config.sections.charts[chart]) return;
    const start = config.windows[chart];
    const end = start + size - 1;
    const projected = Math.max(0, end - Math.max(current, start - 1));
    lines.push({
      label: CHART_TITLES[chart],
      value: `${labelOf(start)} a ${labelOf(end)} (${size} meses${
        projected > 0 ? `, ${projected} projetado${projected === 1 ? "" : "s"}` : ", sem projeção"
      })`,
    });
  });

  if (config.sections.distributions) {
    lines.push({
      label: "Distribuições",
      value: `entradas ${GROUP_LABEL[config.distribution.entries]}, saídas ${GROUP_LABEL[config.distribution.expenses]} (${monthLong(current)})`,
    });
  }
  if (config.sections.monthItems) {
    lines.push({ label: "Lançamentos", value: `todas as entradas e saídas de ${monthLong(current)}` });
  }

  const rate = rates[config.currency] ?? 1;
  lines.push({
    label: "Moeda",
    value:
      config.currency === "BRL"
        ? CURRENCY_LABEL.BRL
        : `${CURRENCY_LABEL[config.currency]} - 1 ${config.currency} = ${(1 / rate).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
            minimumFractionDigits: 4,
          })} (cotação de hoje; valores guardados em BRL)`,
  });
  return lines;
}

/** Bounds for one chart's window inside the navigable range - the start can't go
 * before the first month with data, the end can't pass the range's last month. A
 * window larger than the whole range stays where it is (it can't move at all). */
export function windowBounds(range: NavigableRange, size: number): { min: number; max: number } {
  const first = toMonthIndex(range.first_year, range.first_month);
  const last = toMonthIndex(range.last_year, range.last_month);
  return { min: first, max: Math.max(first, last - size + 1) };
}
