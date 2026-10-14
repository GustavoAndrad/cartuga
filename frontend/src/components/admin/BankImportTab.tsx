import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { Button } from "../Button";
import { ConfirmDialog } from "../ConfirmDialog";
import { TrashIcon } from "../table/icons";
import { useToast } from "../../hooks/useToast";
import { extractErrorMessage } from "../../services/api";
import { commitBankImport, previewBankImport } from "../../services/bankImportApi";
import type { BankImportCommitResult, BankImportRow, BankName, ImportKind, PaymentMethod } from "../../types";

const cardClass = "rounded-xl border border-neutral-300 bg-[var(--color-surface)] p-5 dark:border-neutral-800";
const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 focus:border-cartuga-500 focus:outline-none focus:ring-1 focus:ring-cartuga-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50";
const invalidInputClass = "border-red-400 focus:border-red-500 focus:ring-red-500 dark:border-red-500/70";

// Distinct hues per kind so a review list with dozens of lines can be scanned at a
// glance - green/red reuse the app's existing income/expense convention (see
// CurrencyAmount's colorize), blue/amber are new but consistent with the Cofre badges
// (VaultTypeBadge already uses amber for a carve, so amber here for "saiu do cofre"
// reads the same way).
const KIND_META: Record<ImportKind, { label: string; dot: string; border: string }> = {
  ENTRADA: { label: "Entrada", dot: "bg-cartuga-500", border: "border-l-cartuga-500" },
  SAIDA: { label: "Saída", dot: "bg-red-500", border: "border-l-red-500" },
  GUARDAR: { label: "Guardar (Cofre)", dot: "bg-blue-500", border: "border-l-blue-500" },
  RETIRAR: { label: "Retirar (Cofre)", dot: "bg-amber-500", border: "border-l-amber-500" },
};

function WarningIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 3 1 21h22L12 3Zm0 5.5 6.6 11H5.4L12 8.5ZM11 11v4h2v-4h-2Zm0 5.5v2h2v-2h-2Z" />
    </svg>
  );
}

// Not literal logo reproductions - simple brand-colored monograms so the two bank
// buttons are recognizable at a glance without reproducing either bank's actual mark.
function BankBadge({ bank, className = "h-6 w-6" }: { bank: BankName; className?: string }) {
  if (bank === "INTER") {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[#FF7A00] text-[11px] font-bold leading-none text-white ${className}`}
      >
        i
      </span>
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-[#820AD1] text-[8px] font-bold uppercase leading-none text-white ${className}`}
    >
      nu
    </span>
  );
}

function emptyRow(): BankImportRow {
  return {
    kind: "ENTRADA",
    date: null,
    amount: null,
    description: "",
    source: "",
    payment_method: null,
    warnings: [],
    raw: {},
  };
}

function rowIsIncomplete(row: BankImportRow): boolean {
  if (!row.date || !row.amount || Number(row.amount) <= 0) return true;
  if (row.kind === "ENTRADA" || row.kind === "SAIDA") {
    if (!row.description.trim() || !row.source.trim()) return true;
  }
  return false;
}

export function BankImportTab() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [bank, setBank] = useState<BankName>("INTER");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rows, setRows] = useState<BankImportRow[]>([]);
  const [fileWarnings, setFileWarnings] = useState<string[]>([]);
  const [commitResult, setCommitResult] = useState<BankImportCommitResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const previewMutation = useMutation({
    mutationFn: () => previewBankImport(selectedFile!, bank),
    onSuccess: (data) => {
      setRows(data.rows);
      setFileWarnings(data.file_warnings);
      setCommitResult(null);
      if (data.rows.length === 0) {
        showToast("Nenhum lançamento foi identificado no arquivo.", "error");
      } else {
        showToast(`${data.rows.length} lançamento(s) identificado(s). Revise antes de confirmar.`, "success");
      }
    },
    onError: (err) => showToast(extractErrorMessage(err, "Não foi possível analisar o arquivo."), "error"),
  });

  const commitMutation = useMutation({
    mutationFn: () => commitBankImport(rows),
    onSuccess: (result) => {
      setCommitResult(result);
      // Drop the rows that made it in; keep the failed ones in the grid so the user
      // can fix and resubmit without redoing the whole review from scratch.
      const failedIndexes = new Set(result.results.filter((r) => r.status === "error").map((r) => r.index));
      setRows((prev) => prev.filter((_, i) => failedIndexes.has(i)));
      if (result.created > 0) {
        queryClient.invalidateQueries({ queryKey: ["entries"] });
        queryClient.invalidateQueries({ queryKey: ["expenses"] });
        queryClient.invalidateQueries({ queryKey: ["vault"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["planning"] });
      }
      if (result.failed === 0) {
        showToast(`${result.created} registro(s) importado(s) com sucesso.`, "success");
      } else {
        showToast(`${result.created} importado(s), ${result.failed} com erro. Corrija e tente novamente.`, "error");
      }
    },
    onError: (err) => showToast(extractErrorMessage(err, "Não foi possível concluir a importação."), "error"),
    onSettled: () => setConfirmOpen(false),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setRows([]);
    setFileWarnings([]);
    setCommitResult(null);
  }

  function updateRow(index: number, patch: Partial<BankImportRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  const pendingCount = rows.filter(rowIsIncomplete).length;

  return (
    <div className="flex flex-col gap-6">
      <div className={cardClass}>
        <h2 className="mb-2 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          Importar extrato bancário
        </h2>
        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
          Envie um extrato em CSV do Inter ou do Nubank para transformar os lançamentos em
          entradas, saídas e movimentações do Cofre. Nada é gravado até você revisar e
          confirmar a lista abaixo - isso só adiciona os registros identificados, nunca
          substitui os dados existentes.
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(["INTER", "NUBANK"] as BankName[]).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBank(b)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                bank === b
                  ? "bg-cartuga-600 text-white"
                  : "border border-neutral-300 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              <BankBadge bank={b} />
              {b === "INTER" ? "Banco Inter" : "Nubank"}
            </button>
          ))}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="mb-4 block w-full text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-200 file:px-3 file:py-2 file:text-sm file:font-medium file:text-neutral-700 hover:file:bg-neutral-300 dark:text-neutral-300 dark:file:bg-neutral-700 dark:file:text-neutral-100"
        />

        <Button
          variant="secondary"
          disabled={!selectedFile}
          loading={previewMutation.isPending}
          onClick={() => previewMutation.mutate()}
        >
          {previewMutation.isPending ? "Analisando..." : "Analisar arquivo"}
        </Button>
      </div>

      {fileWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <ul className="list-inside list-disc">
            {fileWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {rows.length > 0 && (
        <div className={cardClass}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
              Revisão ({rows.length} linha{rows.length === 1 ? "" : "s"}
              {pendingCount > 0 ? `, ${pendingCount} pendente${pendingCount === 1 ? "" : "s"}` : ""})
            </h3>
            <Button variant="secondary" onClick={addRow}>
              + Adicionar linha
            </Button>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
            {(Object.keys(KIND_META) as ImportKind[]).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${KIND_META[k].dot}`} />
                {KIND_META[k].label}
              </span>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                  <th className="px-2 py-2">Natureza</th>
                  <th className="px-2 py-2">Data</th>
                  <th className="px-2 py-2">Valor</th>
                  <th className="px-2 py-2">Descrição</th>
                  <th className="px-2 py-2">Fonte</th>
                  <th className="px-2 py-2">Pagamento</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const isVaultKind = row.kind === "GUARDAR" || row.kind === "RETIRAR";
                  return (
                    <tr
                      key={index}
                      className={`border-b border-neutral-100 align-top dark:border-neutral-800/60 ${
                        row.warnings.length > 0 ? "bg-amber-50/60 dark:bg-amber-950/10" : ""
                      }`}
                    >
                      <td className={`border-l-4 px-2 py-2 ${KIND_META[row.kind].border}`}>
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${KIND_META[row.kind].dot}`}
                            aria-hidden="true"
                          />
                          <select
                            value={row.kind}
                            onChange={(e) => {
                              const kind = e.target.value as ImportKind;
                              updateRow(index, {
                                kind,
                                payment_method: kind === "SAIDA" ? row.payment_method ?? "CONTA" : row.payment_method,
                              });
                            }}
                            className={inputClass}
                          >
                            {(Object.keys(KIND_META) as ImportKind[]).map((k) => (
                              <option key={k} value={k}>
                                {KIND_META[k].label}
                              </option>
                            ))}
                          </select>
                        </div>
                        {row.warnings.length > 0 && (
                          <div className="mt-1 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
                            <WarningIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>{row.warnings.join(" ")}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="date"
                          value={row.date ?? ""}
                          onChange={(e) => updateRow(index, { date: e.target.value || null })}
                          className={`${inputClass} ${!row.date ? invalidInputClass : ""}`}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.amount ?? ""}
                          onChange={(e) => updateRow(index, { amount: e.target.value || null })}
                          className={`${inputClass} ${!row.amount || Number(row.amount) <= 0 ? invalidInputClass : ""}`}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="text"
                          value={row.description}
                          onChange={(e) => updateRow(index, { description: e.target.value })}
                          className={`${inputClass} ${!row.description.trim() ? invalidInputClass : ""}`}
                        />
                      </td>
                      <td className="px-2 py-2">
                        {isVaultKind ? (
                          <span className="text-xs text-neutral-400 dark:text-neutral-500">-</span>
                        ) : (
                          <input
                            type="text"
                            value={row.source}
                            onChange={(e) => updateRow(index, { source: e.target.value })}
                            className={`${inputClass} ${!row.source.trim() ? invalidInputClass : ""}`}
                          />
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {row.kind === "SAIDA" ? (
                          <select
                            value={row.payment_method ?? "CONTA"}
                            onChange={(e) => updateRow(index, { payment_method: e.target.value as PaymentMethod })}
                            className={inputClass}
                          >
                            <option value="CONTA">Conta</option>
                            <option value="CREDITO">Crédito</option>
                          </select>
                        ) : (
                          <span className="text-xs text-neutral-400 dark:text-neutral-500">-</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => removeRow(index)}
                          className="rounded-lg p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                          title="Excluir linha"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex justify-end">
            <Button onClick={() => setConfirmOpen(true)} disabled={rows.length === 0}>
              Confirmar importação
            </Button>
          </div>
        </div>
      )}

      {commitResult && (
        <div className={cardClass}>
          <h3 className="mb-2 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
            Resultado da importação
          </h3>
          <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-300">
            {commitResult.created} registro(s) criado(s)
            {commitResult.failed > 0
              ? `, ${commitResult.failed} com erro (mantidos na revisão acima para correção).`
              : "."}
          </p>
          {commitResult.failed > 0 && (
            <ul className="max-h-48 overflow-y-auto text-xs text-red-600 dark:text-red-400">
              {commitResult.results
                .filter((r) => r.status === "error")
                .map((r) => (
                  <li key={r.index}>
                    Linha {r.index + 1}: {r.message}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Confirmar importação?"
        message={`Isso vai criar ${rows.length} registro(s) (entradas, saídas e/ou movimentações do Cofre) a partir da lista revisada. Nenhum dado existente será alterado ou removido.`}
        confirmLabel="Importar"
        loadingLabel="Importando..."
        loading={commitMutation.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => commitMutation.mutate()}
      />
    </div>
  );
}
