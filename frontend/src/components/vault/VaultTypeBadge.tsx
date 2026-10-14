import type { VaultTransactionType } from "../../types";

const LABELS: Record<VaultTransactionType, string> = {
  DEPOSIT_FRESH: "Investimento",
  DEPOSIT_CARVE: "Recorte",
  WITHDRAWAL: "Retirada",
};

const CLASSES: Record<VaultTransactionType, string> = {
  DEPOSIT_FRESH: "bg-cartuga-100 text-cartuga-700 dark:bg-cartuga-900/30 dark:text-cartuga-300",
  DEPOSIT_CARVE: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  WITHDRAWAL: "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400",
};

export function VaultTypeBadge({ type }: { type: VaultTransactionType }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CLASSES[type]}`}>{LABELS[type]}</span>
  );
}
