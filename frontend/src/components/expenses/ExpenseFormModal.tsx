import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { AutocompleteInput } from "../AutocompleteInput";
import { Button } from "../Button";
import { DateInput } from "../DateInput";
import { Modal } from "../Modal";
import { PlannedToggle } from "../PlannedToggle";
import { FilterChips } from "../table/FilterChips";
import { CalendarIcon, CreditCardIcon, LayersIcon, TagIcon } from "../table/icons";
import { useCurrency } from "../../hooks/useCurrency";
import { formatCurrencyValue } from "../../utils/formatCurrencyValue";
import { listExpenses } from "../../services/expensesApi";
import type { Currency, Expense, ExpenseInput, PaymentMethod, RecurrenceType } from "../../types";
import { VAULT_SOURCE_LABEL } from "../../utils/isInvestment";
import { todayIso } from "../../utils/today";

interface ExpenseFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: ExpenseInput) => Promise<void>;
  initial?: Expense | null;
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

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "CONTA", label: "Conta" },
  { value: "CREDITO", label: "Crédito" },
];

function emptyForm(defaultCurrency: Currency): ExpenseInput {
  return {
    date: todayIso(),
    amount: "",
    currency: defaultCurrency,
    description: "",
    source: "",
    type: "EXCEPTIONAL",
    payment_method: "CONTA",
    start_date: null,
    end_date: null,
    installments_count: null,
    is_planned: false,
  };
}

export function ExpenseFormModal({ open, onClose, onSubmit, initial, loading }: ExpenseFormModalProps) {
  const { currency: displayCurrency, rates } = useCurrency();
  const [form, setForm] = useState<ExpenseInput>(() => emptyForm(displayCurrency));
  const [error, setError] = useState<string | null>(null);

  const { data: existingExpenses } = useQuery({ queryKey: ["expenses"], queryFn: listExpenses, enabled: open });
  const sourceSuggestions = useMemo(
    () =>
      Array.from(new Set((existingExpenses ?? []).map((e) => e.source)))
        .filter((source) => source !== VAULT_SOURCE_LABEL)
        .sort((a, b) => a.localeCompare(b)),
    [existingExpenses]
  );

  // Editing a CREDITO expense only allows changing description/source (spec decision:
  // changing date/amount/currency/count after creation would invalidate already-generated
  // installments and any adjustments applied to them).
  const isCreditLocked = Boolean(initial && initial.payment_method === "CREDITO");
  // A Cofre recorte mirrors its amount/date into the vault's own records at creation
  // time - editing them freely here would silently desync the two. Only description/
  // source stay editable, same treatment as a CREDITO expense.
  const isVaultLocked = Boolean(initial?.is_vault_locked);
  const isLocked = isCreditLocked || isVaultLocked;

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
              payment_method: initial.payment_method,
              start_date: initial.start_date,
              end_date: initial.end_date,
              installments_count: initial.installments.length || null,
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
      setError("Saídas fixas exigem uma data de início.");
      return;
    }
    if (form.payment_method === "CREDITO" && !isCreditLocked) {
      const count = form.installments_count;
      if (!count || count < 1 || count > 24) {
        setError("Informe o número de parcelas (1 a 24).");
        return;
      }
    }
    if (!isLocked && form.source === VAULT_SOURCE_LABEL) {
      setError(`A fonte "${VAULT_SOURCE_LABEL}" é reservada para movimentações do Cofre.`);
      return;
    }

    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a saída.");
    }
  }

  const inputClass =
    "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-cartuga-500 focus:outline-none focus:ring-1 focus:ring-cartuga-500 disabled:bg-neutral-100 disabled:text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:disabled:bg-neutral-800/50";
  const labelClass = "mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200";
  const iconLabelClass = `${labelClass} flex items-center gap-1.5`;

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Editar saída" : "Nova saída"}>
      <form id="expense-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
        {isCreditLocked && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            Compras no crédito só permitem editar descrição e fonte. Para mudar valor,
            moeda ou parcelas, exclua e recrie a compra.
          </p>
        )}
        {isVaultLocked && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            Esta saída foi gerada por um recorte do Cofre - só é possível editar a
            descrição por aqui. Para mudar valor, moeda, data, tipo ou fonte, exclua a
            movimentação na tela do Cofre.
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
              placeholder="Ex.: Mercado, Aluguel..."
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
              placeholder="Mercado, Aluguel, Loja X..."
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
              disabled={isLocked}
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
              disabled={isLocked}
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
            disabled={isLocked}
            fullWidth
          />
        </div>

        <div>
          <label className={iconLabelClass}>
            <CreditCardIcon className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
            Meio de pagamento
          </label>
          <FilterChips
            options={PAYMENT_OPTIONS}
            value={form.payment_method}
            onChange={(payment_method) =>
              setForm({
                ...form,
                payment_method,
                installments_count: payment_method === "CREDITO" ? 1 : null,
                is_planned: payment_method === "CREDITO" ? false : form.is_planned,
              })
            }
            aria-label="Meio de pagamento"
            disabled={isLocked || form.type === "FIXED"}
            fullWidth
          />
        </div>

        {form.payment_method === "CREDITO" && !isCreditLocked && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className={labelClass}>Número de parcelas</label>
              <span className="text-sm font-semibold text-cartuga-700 dark:text-cartuga-300">
                {form.installments_count ?? 1}x
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-neutral-400 dark:text-neutral-500">1</span>
              <input
                type="range"
                min={1}
                max={24}
                step={1}
                value={form.installments_count ?? 1}
                onChange={(e) => setForm({ ...form, installments_count: parseInt(e.target.value, 10) })}
                className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-neutral-200 accent-cartuga-600 dark:bg-neutral-700"
              />
              <span className="text-xs text-neutral-400 dark:text-neutral-500">24</span>
            </div>
          </div>
        )}

        {form.type === "EXCEPTIONAL" && (
          <div>
            <label className={iconLabelClass}>
              <CalendarIcon className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
              Data
            </label>
            <DateInput
              required
              disabled={isLocked}
              value={form.date}
              onChange={(date) =>
                setForm({
                  ...form,
                  date,
                  is_planned: form.payment_method === "CONTA" && date !== todayIso(),
                })
              }
              className={inputClass}
            />
          </div>
        )}

        {form.type === "EXCEPTIONAL" && form.payment_method === "CONTA" && !isLocked && form.date !== todayIso() && (
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
            {form.payment_method === "CONTA" && !isLocked && (
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
        <Button type="submit" form="expense-form" loading={loading}>
          {loading ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </Modal>
  );
}
