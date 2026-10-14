import { CurrencyAmount } from "../CurrencyAmount";
import { PlannedBadge } from "../table/PlannedBadge";
import { TypeBadge } from "../table/TypeBadge";
import { ArrowUpIcon, VaultIcon } from "../table/icons";
import { isInvestmentSource } from "../../utils/isInvestment";
import type { Entry } from "../../types";

interface EntryMiniTableProps {
  entries: Entry[];
  emptyLabel?: string;
  onRowClick?: (entry: Entry) => void;
}

export function EntryMiniTable({ entries, emptyLabel = "Nenhuma entrada neste mês.", onRowClick }: EntryMiniTableProps) {
  if (entries.length === 0) {
    return <p className="text-sm text-neutral-400 dark:text-neutral-500">{emptyLabel}</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
      {entries.map((entry) => (
        <li
          key={entry.id}
          onClick={onRowClick ? () => onRowClick(entry) : undefined}
          className={`flex items-center gap-3 px-4 py-3 ${
            onRowClick ? "cursor-pointer transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/40" : ""
          }`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cartuga-50 text-cartuga-600 dark:bg-cartuga-900/30 dark:text-cartuga-400">
            <ArrowUpIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span className="min-w-0 max-w-full truncate font-medium text-neutral-800 dark:text-neutral-100">
                {entry.description}
              </span>
              {isInvestmentSource(entry.source) && (
                <span title="Investimento" className="inline-flex shrink-0">
                  <VaultIcon className="h-3.5 w-3.5 text-cartuga-600 dark:text-cartuga-400" />
                </span>
              )}
              <span className="shrink-0">
                <TypeBadge type={entry.type} />
              </span>
              {entry.is_planned && <PlannedBadge className="shrink-0" />}
            </p>
            <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">{entry.source}</p>
          </div>
          <CurrencyAmount amount={entry.amount} className="shrink-0 font-semibold text-neutral-900 dark:text-neutral-50" />
        </li>
      ))}
    </ul>
  );
}
