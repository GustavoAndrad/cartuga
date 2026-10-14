import { useState } from "react";

import { Button } from "../Button";
import { CurrencyAmount } from "../CurrencyAmount";
import { DetailCard, QuickFact, QuickFacts } from "../DetailModalSections";
import { HistoricalCurrencyConverter } from "../HistoricalCurrencyConverter";
import { ImpactModal } from "../ImpactModal";
import { Modal } from "../Modal";
import { PlannedBadge } from "../table/PlannedBadge";
import {
  ArrowUpIcon,
  CheckIcon,
  ClockIcon,
  CurrencyExchangeIcon,
  ImpactIcon,
  PencilIcon,
  TrashIcon,
  VaultIcon,
} from "../table/icons";
import { TypeBadge } from "../table/TypeBadge";
import type { Currency, Entry } from "../../types";
import { formatDateRange } from "../../utils/formatDateRange";
import { formatCurrencyValue } from "../../utils/formatCurrencyValue";
import { isInvestmentSource } from "../../utils/isInvestment";
import { formatDateTime } from "../../utils/formatDateTime";

interface EntryDetailModalProps {
  entry: Entry | null;
  onClose: () => void;
  onEdit: (entry: Entry) => void;
  onDelete: (entry: Entry) => void;
  /** Opens the edit form pre-filled with "Planejado" already unchecked - saving
   * confirms it as the real value. Only offered for an EXCEPTIONAL entry - a FIXED one
   * is reviewed one month at a time from the Planejamentos page instead (this modal
   * has no single occurrence to confirm). Omit to hide the Confirmar action outright. */
  onConfirm?: (entry: Entry) => void;
}

const CURRENCY_LABELS: Record<Currency, string> = {
  BRL: "Real (BRL)",
  USD: "Dólar (USD)",
  EUR: "Euro (EUR)",
};

export function EntryDetailModal({ entry, onClose, onEdit, onDelete, onConfirm }: EntryDetailModalProps) {
  const [impactOpen, setImpactOpen] = useState(false);

  if (!entry) return null;

  const isInvestment = isInvestmentSource(entry.source);
  const wasEdited = entry.updated_at !== entry.created_at;
  const isForeign = entry.currency !== "BRL";
  const canQuickConfirm = Boolean(entry.is_planned && entry.type === "EXCEPTIONAL" && onConfirm);

  return (
    <Modal
      open={Boolean(entry)}
      onClose={onClose}
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cartuga-50 text-cartuga-600 dark:bg-cartuga-900/30 dark:text-cartuga-400">
            <ArrowUpIcon className="h-3.5 w-3.5" />
          </span>
          <span className="truncate">{entry.description}</span>
        </span>
      }
      footer={
        <div className="flex w-full flex-col gap-2.5">
          {entry.counts_toward_dashboard && (
            <Button variant="secondary" className="self-start" onClick={() => setImpactOpen(true)}>
              <ImpactIcon className="h-4 w-4" />
              Ver impacto
            </Button>
          )}
          <div className="flex flex-wrap justify-end gap-2.5">
            <Button variant="danger" onClick={() => onDelete(entry)}>
              <TrashIcon className="h-4 w-4" />
              Excluir
            </Button>
            {canQuickConfirm && (
              <Button onClick={() => onConfirm!(entry)}>
                <CheckIcon className="h-4 w-4" />
                Confirmar
              </Button>
            )}
            <Button variant={canQuickConfirm ? "secondary" : "primary"} onClick={() => onEdit(entry)}>
              <PencilIcon className="h-4 w-4" />
              Editar
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-cartuga-50 p-5 text-center dark:bg-cartuga-900/30">
          <p className="flex items-center justify-center gap-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Valor
            {entry.is_planned && <PlannedBadge />}
          </p>
          <p className="mt-1 text-3xl font-semibold text-cartuga-700 dark:text-cartuga-300">
            <CurrencyAmount amount={entry.amount} />
          </p>
          {entry.is_planned && (
            <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
              {entry.type === "EXCEPTIONAL"
                ? "Estimativa ainda não confirmada, mas já conta normalmente no saldo."
                : "Entrada fixa estimada: cada mês é revisado separadamente em Planejamentos, e já conta normalmente no saldo."}
            </p>
          )}
          {isInvestment && (
            <div className="mt-3 flex justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cartuga-100 px-3 py-1 text-xs font-medium text-cartuga-700 dark:bg-cartuga-900/40 dark:text-cartuga-300">
                <VaultIcon className="h-3.5 w-3.5 shrink-0" />
                {entry.counts_toward_dashboard
                  ? "Retirado do Cofre: conta para o saldo normalmente"
                  : "Vindo do Cofre: não conta para o saldo nem para os cálculos do dashboard"}
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
                  {entry.source}
                </span>
              ) : (
                entry.source
              )
            }
          />
          <QuickFact label="Tipo" value={<TypeBadge type={entry.type} />} />
          <QuickFact label="Moeda" value={CURRENCY_LABELS[entry.currency]} />
          <QuickFact label="Período" value={formatDateRange(entry)} />
        </QuickFacts>

        {isForeign && (
          <DetailCard icon={<CurrencyExchangeIcon className="h-4 w-4" />} title="Valor original">
            <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
              {formatCurrencyValue(entry.original_amount, entry.currency)}
            </p>
            <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
              1 {entry.currency} = {formatCurrencyValue(entry.exchange_rate, "BRL")} · PTAX de{" "}
              {new Date(`${entry.exchange_rate_date}T00:00:00`).toLocaleDateString("pt-BR")}
            </p>
            <div className="mt-3">
              <HistoricalCurrencyConverter
                date={entry.exchange_rate_date}
                amountBRL={entry.amount}
                nativeCurrency={entry.currency}
                nativeOriginalAmount={entry.original_amount}
              />
            </div>
          </DetailCard>
        )}
        {!isForeign && (
          <HistoricalCurrencyConverter
            date={entry.exchange_rate_date}
            amountBRL={entry.amount}
            nativeCurrency={entry.currency}
            nativeOriginalAmount={entry.original_amount}
          />
        )}

        <div className="flex items-center gap-1.5 border-t border-neutral-200 pt-3 text-xs text-neutral-400 dark:border-neutral-800 dark:text-neutral-500">
          <ClockIcon className="h-3.5 w-3.5 shrink-0" />
          <span>
            Criada em {formatDateTime(entry.created_at)}
            {wasEdited && <> · editada em {formatDateTime(entry.updated_at)}</>}
          </span>
        </div>
      </div>

      <ImpactModal
        open={impactOpen}
        onClose={() => setImpactOpen(false)}
        kind="entry"
        id={entry.id}
        description={entry.description}
      />
    </Modal>
  );
}
