import { CurrencyAmount } from "../CurrencyAmount";
import { PlannedBadge } from "../table/PlannedBadge";
import { TypeBadge } from "../table/TypeBadge";
import { ArrowDownIcon, VaultIcon } from "../table/icons";
import { monthFull } from "../../charts/monthLabels";
import { isInvestmentSource } from "../../utils/isInvestment";
import type { MonthExpenseLine } from "../../types";

interface ExpenseMiniTableProps {
  expenses: MonthExpenseLine[];
  emptyLabel?: string;
  onRowClick?: (line: MonthExpenseLine) => void;
}

export function ExpenseMiniTable({
  expenses,
  emptyLabel = "Nenhuma saída neste mês.",
  onRowClick,
}: ExpenseMiniTableProps) {
  if (expenses.length === 0) {
    return <p className="text-sm text-neutral-400 dark:text-neutral-500">{emptyLabel}</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
      {expenses.map((line, idx) => (
        <li
          key={idx}
          onClick={onRowClick ? () => onRowClick(line) : undefined}
          className={`flex items-center gap-3 px-4 py-3 ${
            onRowClick ? "cursor-pointer transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/40" : ""
          }`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-400">
            <ArrowDownIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span className="min-w-0 max-w-full truncate font-medium text-neutral-800 dark:text-neutral-100">
                {line.description}
              </span>
              {isInvestmentSource(line.source) && (
                <span title="Investimento" className="inline-flex shrink-0">
                  <VaultIcon className="h-3.5 w-3.5 text-cartuga-600 dark:text-cartuga-400" />
                </span>
              )}
              <span className="shrink-0">
                <TypeBadge type={line.type} />
              </span>
              {line.is_planned && <PlannedBadge className="shrink-0" />}
            </p>
            <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
              {line.source}
              {line.payment_method === "CREDITO" && line.installment && (
                <> · parcela {line.installment.installment_number}/{line.installment.total_installments}</>
              )}
              {line.installment?.advanced_to_year && (
                <span className="text-cartuga-600 dark:text-cartuga-400">
                  {" "}
                  · antecipada de {monthFull(new Date(`${line.installment.due_date}T00:00:00`).getMonth() + 1).toLowerCase()}
                </span>
              )}
            </p>
          </div>
          <CurrencyAmount amount={line.amount} className="shrink-0 font-semibold text-neutral-900 dark:text-neutral-50" />
        </li>
      ))}
    </ul>
  );
}
