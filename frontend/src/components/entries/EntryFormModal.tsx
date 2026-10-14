import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { AutocompleteInput } from "../AutocompleteInput";
import { Button } from "../Button";
import { DateInput } from "../DateInput";
import { Modal } from "../Modal";
import { PlannedToggle } from "../PlannedToggle";
import { FilterChips } from "../table/FilterChips";
import { CalendarIcon, LayersIcon, TagIcon } from "../table/icons";
import { useCurrency } from "../../hooks/useCurrency";
import { formatCurrencyValue } from "../../utils/formatCurrencyValue";
import { listEntries } from "../../services/entriesApi";
import type { Currency, Entry, EntryInput, RecurrenceType } from "../../types";
import { VAULT_SOURCE_LABEL } from "../../utils/isInvestment";
import { todayIso } from "../../utils/today";

interface EntryFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: EntryInput) => Promise<void>;
  initial?: Entry | null;
  loading?: boolean;
}

const CURRENCY_OPTIONS: { value: Currency; label: string }[] = [
  { value: "BRL", label: "BRL" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
];

const TYPE_OPTIONS: { value: RecurrenceType; label: string }[] = [
  { value: "EXCEPTIONAL", label: "Excepcional" },
  { value: "FIXED", label: "Fixa" },
];

function emptyForm(defaultCurrency: Currency): EntryInput {
  return {
    date: todayIso(),
    amount: "",
    currency: defaultCurrency,
    description: "",
    source: "",
    type: "EXCEPTIONAL",
    start_date: null,
    end_date: null,
    is_planned: false,
  };
}

export function EntryFormModal({ open, onClose, onSubmit, initial, loading }: EntryFormModalProps) {
  const { currency: displayCurrency, rates } = useCurrency();
  const [form, setForm] = useState<EntryInput>(() => emptyForm(displayCurrency));
  const [error, setError] = useState<string | null>(null);

  const { data: existingEntries } = useQuery({ queryKey: ["entries"], queryFn: listEntries, enabled: open });
  const sourceSuggestions = useMemo(
    () =>
      Array.from(new Set((existingEntries ?? []).map((e) => e.source)))
        .filter((source) => source !== VAULT_SOURCE_LABEL)
        .sort((a, b) => a.localeCompare(b)),
    [existingEntries]
  );

  // A Cofre deposit/withdrawal mirrors its amount/date into the vault's own records at
  // creation time - editing them freely here would silently desync the two, or (worse)
  // turning one into a FIXED entry would make the dashboard count it every month while
  // the Cofre still treats it as a single event. Only description/source stay editable,
  // same treatment as a CREDITO expense.
  const isVaultLocked = Boolean(initial?.is_vault_locked);

  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? {
              date: initial.date,
              amount: initial.original_amount,
              currency: initial.currency,
              description: initial.description,
              source: initial.source,
              type: initial.type,
              start_date: initial.start_date,
              end_date: initial.end_date,
              is_planned: initial.is_planned,
            }
          : emptyForm(displayCurrency)
      );
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const amountNumeric = parseFloat(form.amount);
  const showConversionHint = form.currency !== "BRL" && !Number.isNaN(amountNumeric) && amountNumeric > 0;
  const conversionHint = showConversionHint
    ? formatCurrencyValue(amountNumeric / (rates[form.currency] || 1), "BRL")
    : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.type === "FIXED" && !form.start_date) {
      setError("Entradas fixas exigem uma data de início.");
      return;
    }
    if (!isVaultLocked && form.source === VAULT_SOURCE_LABEL) {
      setError(`A fonte "${VAULT_SOURCE_LABEL}" é reservada para movimentações do Cofre.`);
      return;
    }

    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a entrada.");
    }
  }

  const inputClass =
    "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-cartuga-500 focus:outline-none focus:ring-1 focus:ring-cartuga-500 disabled:bg-neutral-100 disabled:text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:disabled:bg-neutral-800/50";
  const labelClass = "mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200";
  const iconLabelClass = `${labelClass} flex items-center gap-1.5`;

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Editar entrada" : "Nova entrada"}>
      <form id="entry-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
        {isVaultLocked && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            Esta entrada foi gerada pelo Cofre - só é possível editar a descrição por aqui.
            Para mudar valor, moeda, data, tipo ou fonte, exclua a movimentação na tela do Cofre.
          </p>
        )}

        <div className="flex flex-col gap-4">
          <div>
            <label className={labelClass}>Descrição</label>
            <input
              required
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={inputClass}
              placeholder="Ex.: Salário, Venda de item..."
            />
          </div>

          <div>
            <label className={iconLabelClass}>
              <TagIcon className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
              Fonte
            </label>
            <AutocompleteInput
              required
              disabled={isVaultLocked}
              value={form.source}
              onChange={(source) => setForm({ ...form, source })}
              suggestions={sourceSuggestions}
              className={inputClass}
              placeholder="Salário, Freelance, Outros..."
            />
          </div>
        </div>

        <div className="rounded-xl border border-cartuga-200 bg-cartuga-50 p-4 dark:border-cartuga-900/50 dark:bg-cartuga-900/20">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-cartuga-700 dark:text-cartuga-300">
            Valor
          </label>
          <div className="flex items-center gap-3">
            <input
              required
              disabled={isVaultLocked}
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0,00"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="min-w-0 flex-1 border-0 border-b-2 border-cartuga-300 bg-transparent px-0 py-1 text-2xl font-semibold text-neutral-900 focus:border-cartuga-600 focus:outline-none disabled:text-neutral-400 dark:border-cartuga-800 dark:text-neutral-50 dark:focus:border-cartuga-400"
            />
            <FilterChips
              options={CURRENCY_OPTIONS}
              value={form.currency}
              onChange={(currency) => setForm({ ...form, currency })}
              aria-label="Moeda"
              disabled={isVaultLocked}
              className="shrink-0 border-cartuga-200 bg-white dark:border-cartuga-900/50 dark:bg-neutral-900"
            />
          </div>
          {conversionHint && (
            <p className="mt-2 text-xs text-cartuga-700/80 dark:text-cartuga-300/70">
              ≈ {conversionHint} na cotação atual (o valor final usa a cotação da data escolhida)
            </p>
          )}
        </div>

        <div>
          <label className={iconLabelClass}>
            <LayersIcon className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
            Tipo
          </label>
          <FilterChips
            options={TYPE_OPTIONS}
            value={form.type}
            onChange={(type) => setForm({ ...form, type })}
            aria-label="Tipo"
            disabled={isVaultLocked}
            fullWidth
          />
        </div>

        {form.type === "EXCEPTIONAL" && (
          <div>
            <label className={iconLabelClass}>
              <CalendarIcon className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
              Data
            </label>
            <DateInput
              required
              disabled={isVaultLocked}
              value={form.date}
              onChange={(date) => setForm({ ...form, date, is_planned: date !== todayIso() })}
              className={inputClass}
            />
          </div>
        )}

        {form.type === "EXCEPTIONAL" && !isVaultLocked && form.date !== todayIso() && (
          <PlannedToggle
            checked={form.is_planned}
            onChange={(is_planned) => setForm({ ...form, is_planned })}
          />
        )}

        {form.type === "FIXED" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={iconLabelClass}>
                  <CalendarIcon className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
                  Data de início
                </label>
                <DateInput
                  required
                  value={form.start_date ?? ""}
                  onChange={(date) => setForm({ ...form, date, start_date: date })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Data de término (opcional)</label>
                <DateInput
                  value={form.end_date ?? ""}
                  onChange={(date) => setForm({ ...form, end_date: date || null })}
                  className={inputClass}
                />
              </div>
            </div>
            {!isVaultLocked && (
              <PlannedToggle checked={form.is_planned} onChange={(is_planned) => setForm({ ...form, is_planned })} />
            )}
          </>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </form>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button type="submit" form="entry-form" loading={loading}>
          {loading ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </Modal>
  );
}
