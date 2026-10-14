import Highcharts from "highcharts";
import HighchartsMore from "highcharts/highcharts-more";
import HighchartsReact from "highcharts-react-official";
import { useMemo } from "react";

import { CurrencyAmount } from "../CurrencyAmount";
import { Modal } from "../Modal";
import { PlannedBadge } from "../table/PlannedBadge";
import { VaultIcon } from "../table/icons";
import { monthFull } from "../../charts/monthLabels";
import { baseChartOptions, SERIES_COLORS } from "../../charts/theme";
import { useCurrency } from "../../hooks/useCurrency";
import { useTheme } from "../../hooks/useTheme";
import type { Entry, MonthExpenseLine } from "../../types";
import { isInvestmentSource } from "../../utils/isInvestment";

HighchartsMore(Highcharts);

export type CalculationMode = "entries" | "expenses" | "balance";

interface CalculationModalProps {
  open: boolean;
  onClose: () => void;
  mode: CalculationMode;
  monthLabel: string;
  entries: Entry[];
  expenses: MonthExpenseLine[];
  /** Opens the full detail modal for the entry/expense a row or chart bar represents.
   * Omit to render the calculation read-only, with no click affordance. */
  onOpenEntry?: (entry: Entry) => void;
  onOpenExpense?: (line: MonthExpenseLine) => void;
}

interface Row {
  label: string;
  sub: string | null;
  amount: number;
  sign: 1 | -1;
  isInvestment: boolean;
  isPlanned: boolean;
  onClick?: () => void;
}

const MODE_META: Record<CalculationMode, { title: string; totalLabel: string }> = {
  entries: { title: "Cálculo das entradas", totalLabel: "Total de entradas" },
  expenses: { title: "Cálculo das saídas", totalLabel: "Total de saídas" },
  balance: { title: "Cálculo do saldo", totalLabel: "Saldo do mês" },
};

function entryRow(entry: Entry, onOpenEntry?: (entry: Entry) => void): Row {
  return {
    label: entry.description,
    sub: entry.source,
    amount: parseFloat(entry.amount),
    sign: 1,
    isInvestment: isInvestmentSource(entry.source),
    isPlanned: entry.is_planned,
    onClick: onOpenEntry ? () => onOpenEntry(entry) : undefined,
  };
}

function expenseRow(line: MonthExpenseLine, onOpenExpense?: (line: MonthExpenseLine) => void): Row {
  const parts: string[] = [line.source];
  if (line.payment_method === "CREDITO" && line.installment) {
    parts.push(`parcela ${line.installment.installment_number}/${line.installment.total_installments}`);
  }
  if (line.installment?.advanced_to_year) {
    const dueMonth = new Date(`${line.installment.due_date}T00:00:00`).getMonth() + 1;
    parts.push(`antecipada de ${monthFull(dueMonth).toLowerCase()}`);
  }
  return {
    label: line.description,
    sub: parts.join(" · "),
    amount: parseFloat(line.amount),
    sign: -1,
    isInvestment: isInvestmentSource(line.source),
    isPlanned: line.is_planned,
    onClick: onOpenExpense ? () => onOpenExpense(line) : undefined,
  };
}

export function CalculationModal({
  open,
  onClose,
  mode,
  monthLabel,
  entries,
  expenses,
  onOpenEntry,
  onOpenExpense,
}: CalculationModalProps) {
  const { theme } = useTheme();
  const { format, currency } = useCurrency();

  const rows: Row[] = useMemo(() => {
    if (mode === "entries") return entries.map((e) => entryRow(e, onOpenEntry));
    if (mode === "expenses") return expenses.map((e) => expenseRow(e, onOpenExpense));
    return [...entries.map((e) => entryRow(e, onOpenEntry)), ...expenses.map((e) => expenseRow(e, onOpenExpense))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, entries, expenses]);

  // In "balance" mode entradas/saídas genuinely offset each other, so rows contribute
  // their signed amount. In single-type modes every row shares the same sign, and the
  // total is meant to read as the positive magnitude shown on the dashboard card
  // ("Total gasto: R$360") rather than a negative accumulation - so rows contribute
  // their plain amount there, with the −/red styling staying a visual cue only.
  function contribution(row: Row): number {
    return mode === "balance" ? row.sign * row.amount : row.amount;
  }

  const total = rows.reduce((sum, row) => sum + contribution(row), 0);

  const options: Highcharts.Options = useMemo(() => {
    const base = baseChartOptions(theme);

    const data = [
      ...rows.map((row) => ({
        name: row.label,
        y: contribution(row),
        color: row.sign > 0 ? SERIES_COLORS.entradas[theme] : SERIES_COLORS.saidas[theme],
      })),
      { name: MODE_META[mode].totalLabel, isSum: true, color: SERIES_COLORS.saldo[theme] },
    ];

    return {
      ...base,
      chart: { ...base.chart, type: "waterfall", height: 340 },
      xAxis: {
        ...base.xAxis,
        type: "category",
        labels: { ...base.xAxis.labels, rotation: -40 },
      },
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
          const point = this as unknown as { points?: Highcharts.Point[]; x: string };
          const y = point.points?.[0]?.y ?? 0;
          return `<div style="padding:4px;"><div style="font-weight:600;margin-bottom:2px;">${point.x}</div><strong>${format(y)}</strong></div>`;
        },
      },
      plotOptions: {
        ...base.plotOptions,
        waterfall: {
          borderRadius: 4,
          borderWidth: 0,
          dataLabels: { enabled: false },
          point: {
            events: {
              click() {
                // The last point is the sum total, which isn't a real record - only
                // real rows (with an onClick, i.e. a caller that wants drill-down) open
                // the detail modal.
                rows[this.index]?.onClick?.();
              },
            },
          },
          cursor: rows.some((row) => row.onClick) ? "pointer" : undefined,
        },
      },
      series: [{ type: "waterfall", data }],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, mode, theme, currency]);

  return (
    <Modal open={open} onClose={onClose} title={`${MODE_META[mode].title} · ${monthLabel}`} size="xl">
      <div className="flex flex-col gap-6">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Todos os registros somados para chegar nesse valor, um por um.
        </p>

        {rows.length === 0 ? (
          <p className="text-sm text-neutral-400 dark:text-neutral-500">Nenhum registro neste mês.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
            <div className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
              {rows.map((row, idx) => (
                <div
                  key={idx}
                  onClick={row.onClick}
                  className={`flex items-center justify-between gap-3 px-4 py-2.5 ${
                    row.onClick ? "cursor-pointer transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/40" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
                      {row.label}
                      {row.isInvestment && (
                        <span title="Investimento" className="inline-flex shrink-0">
                          <VaultIcon className="h-3.5 w-3.5 text-cartuga-600 dark:text-cartuga-400" />
                        </span>
                      )}
                      {row.isPlanned && <PlannedBadge className="shrink-0" />}
                    </p>
                    {row.sub && (
                      <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{row.sub}</p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 text-sm font-medium ${
                      row.sign > 0
                        ? "text-cartuga-700 dark:text-cartuga-300"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {row.sign > 0 ? "+ " : "− "}
                    {format(row.amount)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between bg-neutral-50 px-4 py-3 dark:bg-neutral-800/60">
              <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                = {MODE_META[mode].totalLabel}
              </span>
              <CurrencyAmount amount={total} className="text-lg font-bold" colorize={mode === "balance"} />
            </div>
          </div>
        )}

        {rows.length > 0 && <HighchartsReact highcharts={Highcharts} options={options} />}
      </div>
    </Modal>
  );
}
