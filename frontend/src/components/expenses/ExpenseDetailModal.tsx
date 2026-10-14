import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "../Button";
import { CurrencyAmount } from "../CurrencyAmount";
import { DetailCard, MiniStat, QuickFact, QuickFacts } from "../DetailModalSections";
import { HistoricalCurrencyConverter } from "../HistoricalCurrencyConverter";
import { ImpactModal } from "../ImpactModal";
import { Modal } from "../Modal";
import { PlannedBadge } from "../table/PlannedBadge";
import {
  ArrowDownIcon,
  CheckIcon,
  CreditCardIcon,
  CurrencyExchangeIcon,
  ClockIcon,
  ImpactIcon,
  PencilIcon,
  TrashIcon,
  VaultIcon,
} from "../table/icons";
import { TypeBadge } from "../table/TypeBadge";
import type { Currency, Expense, Installment } from "../../types";
import { formatDateRange } from "../../utils/formatDateRange";
import { formatCurrencyValue } from "../../utils/formatCurrencyValue";
import { formatDateTime } from "../../utils/formatDateTime";
import { isInvestmentSource } from "../../utils/isInvestment";
import { summarizeInstallments } from "../../utils/installments";
import { listVaultTransactions } from "../../services/vaultApi";

interface ExpenseDetailModalProps {
  expense: Expense | null;
  onClose: () => void;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
  /** Only ever relevant for a CREDITO expense (gated by `installmentsSummary` below),
   * so genuinely optional for a caller that only ever shows CONTA/Planejado ones. */
  onShowInstallments?: (expense: Expense) => void;
  /** Opens the edit form pre-filled with "Planejado" already unchecked - saving
   * confirms it as the real value. Omit to hide the Confirmar action. */
  onConfirm?: (expense: Expense) => void;
  /** The specific installment this view was opened for (e.g. clicked from a month's
   * breakdown) - highlighted separately from the purchase-wide summary below. Omit
   * when there's no such context (e.g. opened from the Saídas table). */
  highlightInstallment?: Installment | null;
}

const CURRENCY_LABELS: Record<Currency, string> = {
  BRL: "Real (BRL)",
  USD: "Dólar (USD)",
  EUR: "Euro (EUR)",
};

export function ExpenseDetailModal({
  expense,
  onClose,
  onEdit,
  onDelete,
  onShowInstallments,
  onConfirm,
  highlightInstallment,
}: ExpenseDetailModalProps) {
  const [impactOpen, setImpactOpen] = useState(false);
  const isInvestment = isInvestmentSource(expense?.source ?? "");

  const { data: vaultTransactions } = useQuery({
    queryKey: ["vault", "transactions"],
    queryFn: listVaultTransactions,
    enabled: isInvestment,
  });

  if (!expense) return null;

  const sourceEntry = vaultTransactions?.find((t) => t.expense_id === expense.id)?.source_entry ?? null;
  const wasEdited = expense.updated_at !== expense.created_at;
  const installmentsSummary =
    expense.payment_method === "CREDITO" ? summarizeInstallments(expense.installments) : null;
  const isForeign = expense.currency !== "BRL";
  const canQuickConfirm = Boolean(expense.is_planned && expense.type === "EXCEPTIONAL" && onConfirm);

  return (
    <Modal
      open={Boolean(expense)}
      onClose={onClose}
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-400">
            <ArrowDownIcon className="h-3.5 w-3.5" />
          </span>
          <span className="truncate">{expense.description}</span>
        </span>
      }
      footer={
        <div className="flex w-full flex-col gap-2.5">
          <Button variant="secondary" className="self-start" onClick={() => setImpactOpen(true)}>
            <ImpactIcon className="h-4 w-4" />
            Ver impacto
          </Button>
          <div className="flex flex-wrap justify-end gap-2.5">
            <Button variant="danger" onClick={() => onDelete(expense)}>
              <TrashIcon className="h-4 w-4" />
              Excluir
            </Button>
            {canQuickConfirm && (
              <Button onClick={() => onConfirm!(expense)}>
                <CheckIcon className="h-4 w-4" />
                Confirmar
              </Button>
            )}
            <Button variant={canQuickConfirm ? "secondary" : "primary"} onClick={() => onEdit(expense)}>
              <PencilIcon className="h-4 w-4" />
              Editar
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-red-50 p-5 text-center dark:bg-red-950/20">
          <p className="flex items-center justify-center gap-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {installmentsSummary ? "Valor total da compra" : "Valor"}
            {expense.is_planned && <PlannedBadge />}
          </p>
          <p className="mt-1 text-3xl font-semibold text-red-600 dark:text-red-400">
            <CurrencyAmount amount={expense.amount} />
          </p>
          {expense.is_planned && (
            <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
              {expense.type === "EXCEPTIONAL"
                ? "Estimativa ainda não confirmada, mas já conta normalmente no saldo."
                : "Saída fixa estimada: cada mês é revisado separadamente em Planejamentos, e já conta normalmente no saldo."}
            </p>
          )}
          {highlightInstallment && (
            <div className="mt-3 flex justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
                <CreditCardIcon className="h-3.5 w-3.5 shrink-0" />
                Parcela {highlightInstallment.installment_number}/{highlightInstallment.total_installments} ·{" "}
                <CurrencyAmount amount={highlightInstallment.final_amount} /> · vence em{" "}
                {new Date(`${highlightInstallment.due_date}T00:00:00`).toLocaleDateString("pt-BR")}
              </span>
            </div>
          )}
          {isInvestment && (
            <div className="mt-3 flex justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cartuga-100 px-3 py-1 text-xs font-medium text-cartuga-700 dark:bg-cartuga-900/40 dark:text-cartuga-300">
                <VaultIcon className="h-3.5 w-3.5 shrink-0" />
                {sourceEntry
                  ? `Recortado de "${sourceEntry.description}": reduz o saldo normalmente`
                  : "Recortado de uma entrada para o Cofre: reduz o saldo normalmente"}
              </span>
            </div>
          )}
        </div>

        <QuickFacts>
          <QuickFact
            label="Fonte"
            value={
              isInvestment ? (
                <span className="inline-flex items-center gap-1">
                  <VaultIcon className="h-3.5 w-3.5 shrink-0 text-cartuga-600 dark:text-cartuga-400" />
                  {expense.source}
                </span>
              ) : (
                expense.source
              )
            }
          />
          <QuickFact label="Tipo" value={<TypeBadge type={expense.type} />} />
          <QuickFact label="Moeda" value={CURRENCY_LABELS[expense.currency]} />
          <QuickFact label="Período" value={formatDateRange(expense)} />
        </QuickFacts>

        {installmentsSummary && (
          <DetailCard
            icon={<CreditCardIcon className="h-4 w-4" />}
            title={`Crédito · ${installmentsSummary.total}x`}
            action={
              <button
                type="button"
                onClick={() => onShowInstallments?.(expense)}
                className="text-xs font-medium text-cartuga-600 hover:underline dark:text-cartuga-400"
              >
                Ver todas as parcelas
              </button>
            }
          >
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <MiniStat
                label="Já vencidas"
                value={`${installmentsSummary.pastCount}/${installmentsSummary.total}`}
                sub={<CurrencyAmount amount={installmentsSummary.pastTotal} />}
              />
              <MiniStat
                label="A vencer"
                value={`${installmentsSummary.upcomingCount}/${installmentsSummary.total}`}
                sub={<CurrencyAmount amount={installmentsSummary.upcomingTotal} />}
              />
              {installmentsSummary.advancedCount > 0 && (
                <MiniStat label="Antecipadas" value={installmentsSummary.advancedCount} />
              )}
              {installmentsSummary.adjustmentsTotal !== 0 && (
                <MiniStat
                  label="Ajustes"
                  value={<CurrencyAmount amount={installmentsSummary.adjustmentsTotal} />}
                />
              )}
            </div>
          </DetailCard>
        )}

        {isForeign && (
          <DetailCard icon={<CurrencyExchangeIcon className="h-4 w-4" />} title="Valor original">
            <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
              {formatCurrencyValue(expense.original_amount, expense.currency)}
            </p>
            <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
              1 {expense.currency} = {formatCurrencyValue(expense.exchange_rate, "BRL")} · PTAX de{" "}
              {new Date(`${expense.exchange_rate_date}T00:00:00`).toLocaleDateString("pt-BR")}
            </p>
            <div className="mt-3">
              <HistoricalCurrencyConverter
                date={expense.exchange_rate_date}
                amountBRL={expense.amount}
                nativeCurrency={expense.currency}
                nativeOriginalAmount={expense.original_amount}
              />
            </div>
          </DetailCard>
        )}
        {!isForeign && (
          <HistoricalCurrencyConverter
            date={expense.exchange_rate_date}
            amountBRL={expense.amount}
            nativeCurrency={expense.currency}
            nativeOriginalAmount={expense.original_amount}
          />
        )}

        <div className="flex items-center gap-1.5 border-t border-neutral-200 pt-3 text-xs text-neutral-400 dark:border-neutral-800 dark:text-neutral-500">
          <ClockIcon className="h-3.5 w-3.5 shrink-0" />
          <span>
            Criada em {formatDateTime(expense.created_at)}
            {wasEdited && <> · editada em {formatDateTime(expense.updated_at)}</>}
          </span>
        </div>
      </div>

      <ImpactModal
        open={impactOpen}
        onClose={() => setImpactOpen(false)}
        kind="expense"
        id={expense.id}
        description={expense.description}
      />
    </Modal>
  );
}
