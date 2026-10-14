import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "../Button";
import { CurrencyAmount } from "../CurrencyAmount";
import { Modal } from "../Modal";
import { FilterChips } from "../table/FilterChips";
import { CalendarIcon, TagIcon } from "../table/icons";
import { listCarveableEntries } from "../../services/vaultApi";
import type { CarveMode, VaultTransactionInput } from "../../types";

interface VaultTransactionFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: VaultTransactionInput) => Promise<void>;
  action: "GUARDAR" | "RETIRAR";
  loading?: boolean;
  /** Current Cofre balance - only used to cap a RETIRAR amount so a withdrawal can
   * never take out more than was actually set aside. */
  availableBalance?: string;
}

type GuardarMode = "ZERO" | "RECORTE";

const GUARDAR_MODE_OPTIONS: { value: GuardarMode; label: string }[] = [
  { value: "ZERO", label: "Investimento do zero" },
  { value: "RECORTE", label: "Recorte de uma entrada" },
];

const CARVE_MODE_OPTIONS: { value: CarveMode; label: string }[] = [
  { value: "PERCENTAGE", label: "Porcentagem" },
  { value: "FIXED", label: "Valor fixo" },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function VaultTransactionFormModal({
  open,
  onClose,
  onSubmit,
  action,
  loading,
  availableBalance,
}: VaultTransactionFormModalProps) {
  const [guardarMode, setGuardarMode] = useState<GuardarMode>("ZERO");
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [sourceEntryId, setSourceEntryId] = useState<number | "">("");
  const [carveMode, setCarveMode] = useState<CarveMode>("PERCENTAGE");
  const [carveValue, setCarveValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const carveableQuery = useQuery({
    queryKey: ["vault", "carveable-entries"],
    queryFn: listCarveableEntries,
    enabled: open && action === "GUARDAR" && guardarMode === "RECORTE",
  });

  useEffect(() => {
    if (open) {
      setGuardarMode("ZERO");
      setDate(todayIso());
      setAmount("");
      setDescription("");
      setSourceEntryId("");
      setCarveMode("PERCENTAGE");
      setCarveValue("");
      setError(null);
    }
  }, [open, action]);

  const isCarve = action === "GUARDAR" && guardarMode === "RECORTE";
  const selectedEntry = carveableQuery.data?.find((c) => c.entry.id === sourceEntryId) ?? null;

  const carveValueNumeric = parseFloat(carveValue);
  const previewAmount =
    selectedEntry && !Number.isNaN(carveValueNumeric) && carveValueNumeric > 0
      ? carveMode === "PERCENTAGE"
        ? (parseFloat(selectedEntry.entry.amount) * carveValueNumeric) / 100
        : carveValueNumeric
      : null;

  const balanceNumeric = availableBalance !== undefined ? parseFloat(availableBalance) : null;
  const amountNumeric = parseFloat(amount);
  const exceedsBalance =
    action === "RETIRAR" &&
    balanceNumeric !== null &&
    !Number.isNaN(amountNumeric) &&
    amountNumeric > balanceNumeric;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      if (action === "RETIRAR") {
        if (balanceNumeric !== null && amountNumeric > balanceNumeric) {
          setError(
            `A retirada não pode ser maior que o saldo guardado no cofre (R$ ${balanceNumeric.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}).`
          );
          return;
        }
        await onSubmit({ type: "WITHDRAWAL", date, amount, description });
      } else if (guardarMode === "ZERO") {
        await onSubmit({ type: "DEPOSIT_FRESH", date, amount, description });
      } else {
        if (!sourceEntryId) {
          setError("Selecione a entrada de origem do recorte.");
          return;
        }
        await onSubmit({
          type: "DEPOSIT_CARVE",
          date,
          description,
          source_entry_id: sourceEntryId,
          carve_mode: carveMode,
          carve_value: carveValue,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a movimentação.");
    }
  }

  const inputClass =
    "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-cartuga-500 focus:outline-none focus:ring-1 focus:ring-cartuga-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50";
  const labelClass = "mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200";
  const iconLabelClass = `${labelClass} flex items-center gap-1.5`;

  const title = action === "RETIRAR" ? "Retirar do cofre" : "Guardar no cofre";
  const accentClass =
    "rounded-xl border border-cartuga-200 bg-cartuga-50 p-4 dark:border-cartuga-900/50 dark:bg-cartuga-900/20";

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form id="vault-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
        {action === "GUARDAR" && (
          <div>
            <label className={labelClass}>Como você quer guardar?</label>
            <FilterChips
              options={GUARDAR_MODE_OPTIONS}
              value={guardarMode}
              onChange={setGuardarMode}
              aria-label="Modo de guardar"
              className="w-full [&>button]:flex-1"
            />
          </div>
        )}

        <div>
          <label className={labelClass}>Descrição</label>
          <input
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
            placeholder={
              action === "RETIRAR"
                ? "Ex.: Retirada para viagem"
                : isCarve
                  ? "Ex.: Recorte do salário de agosto"
                  : "Ex.: Aporte inicial"
            }
          />
        </div>

        {isCarve ? (
          <div className={accentClass}>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-cartuga-700 dark:text-cartuga-300">
              Entrada de origem
            </label>
            {carveableQuery.isLoading && (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Carregando entradas...</p>
            )}
            {carveableQuery.data && carveableQuery.data.length === 0 && (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Nenhuma entrada disponível para recorte. Apenas entradas Excepcionais (não
                Fixas) com valor ainda não totalmente recortado aparecem aqui.
              </p>
            )}
            {carveableQuery.data && carveableQuery.data.length > 0 && (
              <select
                required
                value={sourceEntryId}
                onChange={(e) => setSourceEntryId(e.target.value ? Number(e.target.value) : "")}
                className={inputClass}
              >
                <option value="">Selecione uma entrada...</option>
                {carveableQuery.data.map((c) => (
                  <option key={c.entry.id} value={c.entry.id}>
                    {c.entry.description} (restam R${" "}
                    {parseFloat(c.remaining_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })})
                  </option>
                ))}
              </select>
            )}

            {selectedEntry && (
              <>
                <div className="mt-3 flex overflow-hidden rounded-lg border border-cartuga-200 bg-white text-xs dark:border-cartuga-900/50 dark:bg-neutral-900">
                  {CARVE_MODE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setCarveMode(opt.value)}
                      className={`flex-1 px-2.5 py-1.5 font-medium transition-colors ${
                        opt.value === carveMode
                          ? "bg-cartuga-600 text-white"
                          : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={carveMode === "PERCENTAGE" ? 100 : undefined}
                    value={carveValue}
                    onChange={(e) => setCarveValue(e.target.value)}
                    placeholder={carveMode === "PERCENTAGE" ? "0-100" : "0,00"}
                    className={inputClass}
                  />
                  {carveMode === "PERCENTAGE" && <span className="text-sm text-neutral-500">%</span>}
                </div>

                {previewAmount !== null && (
                  <p className="mt-2 text-xs text-cartuga-700/80 dark:text-cartuga-300/70">
                    ≈ <CurrencyAmount amount={previewAmount} /> serão recortados desta entrada
                  </p>
                )}
              </>
            )}
          </div>
        ) : (
          <div className={accentClass}>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide text-cartuga-700 dark:text-cartuga-300">
                Valor
              </label>
              {action === "RETIRAR" && balanceNumeric !== null && (
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  Disponível: <CurrencyAmount amount={balanceNumeric} />
                </span>
              )}
            </div>
            <input
              required
              type="number"
              step="0.01"
              min="0.01"
              max={action === "RETIRAR" && balanceNumeric !== null ? balanceNumeric : undefined}
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border-0 border-b-2 border-cartuga-300 bg-transparent px-0 py-1 text-2xl font-semibold text-neutral-900 focus:border-cartuga-600 focus:outline-none dark:border-cartuga-800 dark:text-neutral-50 dark:focus:border-cartuga-400"
            />
            {exceedsBalance && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                Esse valor é maior que o saldo guardado no cofre.
              </p>
            )}
          </div>
        )}

        <div>
          <label className={iconLabelClass}>
            <CalendarIcon className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
            Data
          </label>
          <input
            required
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </div>

        {action === "GUARDAR" && (
          <p className="flex items-start gap-1.5 text-xs text-neutral-400 dark:text-neutral-500">
            <TagIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {guardarMode === "ZERO"
              ? "Registrado como entrada marcada \"Investimento\", sem afetar o saldo do dashboard."
              : "Registrado como saída marcada \"Investimento\": reduz o saldo do dashboard normalmente."}
          </p>
        )}
        {action === "RETIRAR" && (
          <p className="flex items-start gap-1.5 text-xs text-neutral-400 dark:text-neutral-500">
            <TagIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Registrado como entrada marcada "Investimento": soma ao saldo do dashboard normalmente.
          </p>
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
        <Button type="submit" form="vault-form" loading={loading} disabled={exceedsBalance}>
          {loading ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </Modal>
  );
}
