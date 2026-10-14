import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";

import { Button } from "../Button";
import { CurrencyAmount } from "../CurrencyAmount";
import { Modal } from "../Modal";
import { monthFull } from "../../charts/monthLabels";
import { useToast } from "../../hooks/useToast";
import { extractErrorMessage } from "../../services/api";
import {
  addAdjustment,
  advanceInstallment,
  deleteAdjustment,
  unadvanceInstallment,
} from "../../services/installmentsApi";
import type { Expense, Installment } from "../../types";
import { isAdvanced, summarizeInstallments } from "../../utils/installments";

interface InstallmentsModalProps {
  open: boolean;
  onClose: () => void;
  expense: Expense | null;
}

function isFutureMonth(dueDate: string): boolean {
  const [year, month] = dueDate.split("-").map(Number);
  const today = new Date();
  const todayIndex = today.getFullYear() * 12 + (today.getMonth() + 1);
  return year * 12 + month > todayIndex;
}

function AdjustmentForm({ installmentId }: { installmentId: number }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: () => addAdjustment(installmentId, { amount, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      showToast("Ajuste adicionado à parcela.", "success");
      setAmount("");
      setDescription("");
      setOpen(false);
    },
    onError: (err) => showToast(extractErrorMessage(err, "Não foi possível adicionar o ajuste."), "error"),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-cartuga-600 hover:underline dark:text-cartuga-400"
      >
        + Adicionar ajuste
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">Valor (R$)</label>
        <input
          required
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-28 rounded-lg border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">Descrição</label>
        <input
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-40 rounded-lg border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          placeholder="Taxa, desconto..."
        />
      </div>
      <Button type="submit" loading={mutation.isPending} className="!px-3 !py-1.5 text-xs">
        Adicionar
      </Button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-neutral-500 hover:underline dark:text-neutral-400"
      >
        Cancelar
      </button>
    </form>
  );
}

function InstallmentRow({
  installment,
  canAdvance,
  canUnadvance,
}: {
  installment: Installment;
  canAdvance: boolean;
  canUnadvance: boolean;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const removeMutation = useMutation({
    mutationFn: (adjustmentId: number) => deleteAdjustment(installment.id, adjustmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      showToast("Ajuste removido.", "success");
    },
    onError: (err) => showToast(extractErrorMessage(err, "Não foi possível remover o ajuste."), "error"),
  });

  const advanceMutation = useMutation({
    mutationFn: () => advanceInstallment(installment.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      showToast("Parcela antecipada para o mês atual.", "success");
    },
    onError: (err) => showToast(extractErrorMessage(err, "Não foi possível antecipar a parcela."), "error"),
  });

  const unadvanceMutation = useMutation({
    mutationFn: () => unadvanceInstallment(installment.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      showToast("Antecipação desfeita.", "success");
    },
    onError: (err) => showToast(extractErrorMessage(err, "Não foi possível desfazer a antecipação."), "error"),
  });

  const advanced = isAdvanced(installment);

  return (
    <li className="rounded-lg border border-neutral-300 p-3 dark:border-neutral-800">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
          Parcela {installment.installment_number}/{installment.total_installments} · vence em{" "}
          {new Date(installment.due_date + "T00:00:00").toLocaleDateString("pt-BR")}
        </span>
        <CurrencyAmount amount={installment.final_amount} className="font-semibold" />
      </div>

      <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
        Base: <CurrencyAmount amount={installment.base_amount} />
        {installment.adjustments.length > 0 && (
          <>
            {" "}
            + Ajustes:{" "}
            {installment.adjustments.map((adj) => (
              <span key={adj.id} className="ml-1 inline-flex items-center gap-1">
                <CurrencyAmount amount={adj.amount} /> ({adj.description})
                <button
                  onClick={() => removeMutation.mutate(adj.id)}
                  aria-label="Remover ajuste"
                  className="text-red-500 hover:text-red-700"
                >
                  ✕
                </button>
              </span>
            ))}
          </>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <AdjustmentForm installmentId={installment.id} />

        {advanced ? (
          <span className="flex items-center gap-2 rounded-full bg-cartuga-50 px-2.5 py-1 text-xs font-medium text-cartuga-700 dark:bg-cartuga-900/30 dark:text-cartuga-300">
            Antecipada para {monthFull(installment.advanced_to_month!).toLowerCase()} de {installment.advanced_to_year}
            {canUnadvance ? (
              <button
                type="button"
                onClick={() => unadvanceMutation.mutate()}
                disabled={unadvanceMutation.isPending}
                className="font-semibold underline decoration-dotted hover:text-cartuga-900 dark:hover:text-cartuga-100"
              >
                Desfazer
              </button>
            ) : (
              <span
                className="cursor-not-allowed text-cartuga-700/50 dark:text-cartuga-300/50"
                title="Desfaça as antecipações mais recentes primeiro"
              >
                Desfazer
              </span>
            )}
          </span>
        ) : (
          isFutureMonth(installment.due_date) &&
          (canAdvance ? (
            <button
              type="button"
              onClick={() => advanceMutation.mutate()}
              disabled={advanceMutation.isPending}
              className="text-xs font-medium text-cartuga-600 hover:underline dark:text-cartuga-400"
              title="Paga agora, contada no mês atual em vez do mês de vencimento"
            >
              Antecipar parcela
            </button>
          ) : (
            <span
              className="cursor-not-allowed text-xs font-medium text-neutral-400 dark:text-neutral-600"
              title="Antecipe as parcelas anteriores primeiro"
            >
              Antecipar parcela
            </span>
          ))
        )}
      </div>
    </li>
  );
}

function SummaryTile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl bg-neutral-50 p-3 text-center dark:bg-neutral-800/60">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-neutral-900 dark:text-neutral-50">{value}</p>
      {sub && <p className="text-xs text-neutral-400 dark:text-neutral-500">{sub}</p>}
    </div>
  );
}

export function InstallmentsModal({ open, onClose, expense }: InstallmentsModalProps) {
  if (!expense) return null;

  const sorted = expense.installments.slice().sort((a, b) => a.installment_number - b.installment_number);
  const summary = summarizeInstallments(expense.installments);

  // Advancing/undoing only ever touches a contiguous run from the front - the next
  // not-yet-advanced future installment, or the most recently advanced one.
  const nextAdvanceable = sorted.find((i) => !isAdvanced(i) && isFutureMonth(i.due_date));
  const advancedOnes = sorted.filter(isAdvanced);
  const lastAdvanced = advancedOnes.at(-1);

  return (
    <Modal open={open} onClose={onClose} title={`Parcelas de "${expense.description}"`}>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <SummaryTile label="Total parcelado" value={<CurrencyAmount amount={summary.totalFinal} />} />
        <SummaryTile
          label="Já vencidas"
          value={`${summary.pastCount}/${summary.total}`}
          sub={<CurrencyAmount amount={summary.pastTotal} />}
        />
        <SummaryTile
          label="A vencer"
          value={`${summary.upcomingCount}/${summary.total}`}
          sub={<CurrencyAmount amount={summary.upcomingTotal} />}
        />
      </div>
      {summary.adjustmentsTotal !== 0 && (
        <p className="mb-4 text-xs text-neutral-500 dark:text-neutral-400">
          Total em ajustes: <CurrencyAmount amount={summary.adjustmentsTotal} />
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {sorted.map((installment) => (
          <InstallmentRow
            key={installment.id}
            installment={installment}
            canAdvance={installment.id === nextAdvanceable?.id}
            canUnadvance={installment.id === lastAdvanced?.id}
          />
        ))}
      </ul>
    </Modal>
  );
}
