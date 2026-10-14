import { useEffect, useState, type FormEvent } from "react";

import { Button } from "../Button";
import { Modal } from "../Modal";
import { monthFull } from "../../charts/monthLabels";

interface OccurrenceConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (amount: string | null) => void;
  loading?: boolean;
  error?: string | null;
  /** The FIXED rule's own amount (BRL) - prefilled, and the reference point for
   * deciding whether this month is being confirmed as-is or with an override. */
  baseAmount: string;
  year: number;
  month: number;
  description: string;
}

export function OccurrenceConfirmModal({
  open,
  onClose,
  onSubmit,
  loading = false,
  error = null,
  baseAmount,
  year,
  month,
  description,
}: OccurrenceConfirmModalProps) {
  const [amount, setAmount] = useState(baseAmount);

  useEffect(() => {
    if (open) setAmount(baseAmount);
  }, [open, baseAmount]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = amount.trim();
    // Same value as the rule (or left blank) -> confirm with no override; the
    // occurrence is recorded as "happened exactly as estimated".
    onSubmit(trimmed === "" || trimmed === baseAmount ? null : trimmed);
  }

  const inputClass =
    "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-cartuga-500 focus:outline-none focus:ring-1 focus:ring-cartuga-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Confirmar ${monthFull(month).toLowerCase()} de ${year}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button form="occurrence-confirm-form" type="submit" loading={loading}>
            Confirmar
          </Button>
        </>
      }
    >
      <form id="occurrence-confirm-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-neutral-600 dark:text-neutral-300">{description}</p>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200">
            Valor real deste mês (R$)
          </label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Aconteceu como estimado? Deixe o valor como está. Se foi diferente só neste
            mês, ajuste aqui - a regra fixa e os outros meses continuam intactos.
          </p>
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </form>
    </Modal>
  );
}
