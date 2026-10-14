import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CurrencyAmount } from "../components/CurrencyAmount";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { Spinner } from "../components/Spinner";
import { FilterChips } from "../components/table/FilterChips";
import { TrashIcon } from "../components/table/icons";
import { Pagination } from "../components/table/Pagination";
import { VaultBalanceChart } from "../components/vault/VaultBalanceChart";
import { VaultTransactionFormModal } from "../components/vault/VaultTransactionFormModal";
import { VaultTypeBadge } from "../components/vault/VaultTypeBadge";
import { usePagination } from "../hooks/usePagination";
import { useToast } from "../hooks/useToast";
import { extractErrorMessage } from "../services/api";
import {
  createVaultTransaction,
  deleteVaultTransaction,
  getVaultSummary,
  listVaultTransactions,
} from "../services/vaultApi";
import type { VaultTransaction, VaultTransactionInput, VaultTransactionType } from "../types";

type TypeFilter = "ALL" | VaultTransactionType;

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "ALL", label: "Todos" },
  { value: "DEPOSIT_FRESH", label: "Investimento" },
  { value: "DEPOSIT_CARVE", label: "Recorte" },
  { value: "WITHDRAWAL", label: "Retirada" },
];

const deleteIconClass =
  "rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300";

function traceability(transaction: VaultTransaction): string {
  if (transaction.type === "DEPOSIT_CARVE") {
    return transaction.source_entry ? `de: ${transaction.source_entry.description}` : "entrada removida";
  }
  return "-";
}

export function VaultPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [formAction, setFormAction] = useState<"GUARDAR" | "RETIRAR">("GUARDAR");
  const [pendingDelete, setPendingDelete] = useState<VaultTransaction | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");

  const summaryQuery = useQuery({ queryKey: ["vault", "summary"], queryFn: getVaultSummary });
  const transactionsQuery = useQuery({ queryKey: ["vault", "transactions"], queryFn: listVaultTransactions });

  const filtered = (transactionsQuery.data ?? []).filter(
    (t) => typeFilter === "ALL" || t.type === typeFilter
  );
  const { page, setPage, totalPages, pageItems, pageSize, setPageSize, totalItems } = usePagination(filtered);

  useEffect(() => {
    setPage(1);
  }, [typeFilter, setPage]);

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["vault"] });
    queryClient.invalidateQueries({ queryKey: ["entries"] });
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const createMutation = useMutation({
    mutationFn: (payload: VaultTransactionInput) => createVaultTransaction(payload),
    onSuccess: () => {
      invalidateAll();
      showToast("Movimentação registrada.", "success");
      setFormOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteVaultTransaction(id),
    onSuccess: () => {
      invalidateAll();
      showToast("Movimentação excluída.", "success");
      setPendingDelete(null);
    },
    onError: (err) => {
      showToast(extractErrorMessage(err, "Não foi possível excluir a movimentação."), "error");
      setPendingDelete(null);
    },
  });

  async function handleSubmit(payload: VaultTransactionInput) {
    try {
      await createMutation.mutateAsync(payload);
    } catch (err) {
      throw new Error(extractErrorMessage(err, "Não foi possível salvar a movimentação."));
    }
  }

  function openForm(action: "GUARDAR" | "RETIRAR") {
    setFormAction(action);
    setFormOpen(true);
  }

  const isLoading = summaryQuery.isLoading || transactionsQuery.isLoading;
  const isError = summaryQuery.isError || transactionsQuery.isError;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Cofre</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Dinheiro guardado fora do fluxo normal</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => openForm("RETIRAR")}>
            Retirar
          </Button>
          <Button onClick={() => openForm("GUARDAR")}>+ Guardar</Button>
        </div>
      </div>

      {isLoading && <Spinner label="Carregando cofre..." />}
      {isError && (
        <ErrorState
          message="Não foi possível carregar o cofre."
          onRetry={() => {
            summaryQuery.refetch();
            transactionsQuery.refetch();
          }}
        />
      )}

      {summaryQuery.data && (
        <>
          <div className="rounded-xl border border-cartuga-200 bg-cartuga-50 p-4 text-center dark:border-cartuga-900/50 dark:bg-cartuga-900/20">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Saldo guardado
            </p>
            <CurrencyAmount
              amount={summaryQuery.data.balance}
              className="mt-1 block text-2xl font-semibold text-cartuga-700 dark:text-cartuga-300"
            />
          </div>

          {summaryQuery.data.monthly_series.length > 0 && (
            <div className="rounded-xl border border-neutral-300 bg-[var(--color-surface)] p-5 dark:border-neutral-800">
              <VaultBalanceChart series={summaryQuery.data.monthly_series} />
            </div>
          )}
        </>
      )}

      {transactionsQuery.data && transactionsQuery.data.length === 0 && (
        <EmptyState
          title="Nenhuma movimentação no cofre"
          description="Guarde um valor do zero ou recorte parte de uma entrada para começar."
          action={<Button onClick={() => openForm("GUARDAR")}>Guardar pela primeira vez</Button>}
        />
      )}

      {transactionsQuery.data && transactionsQuery.data.length > 0 && (
        <>
          <FilterChips
            options={TYPE_OPTIONS}
            value={typeFilter}
            onChange={setTypeFilter}
            aria-label="Filtrar por tipo"
            className="self-start sm:self-end"
          />

          {totalItems === 0 ? (
            <EmptyState
              title="Nenhum resultado encontrado"
              description="Nenhuma movimentação corresponde ao filtro aplicado."
              action={
                <Button variant="secondary" onClick={() => setTypeFilter("ALL")}>
                  Limpar filtro
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-neutral-300 bg-[var(--color-surface)] dark:border-neutral-800">
              <table className="w-full text-left text-sm sm:min-w-[640px]">
                <thead className="bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
                  <tr>
                    <th className="hidden px-4 py-3 font-medium sm:table-cell">Data</th>
                    <th className="px-4 py-3 font-medium">Descrição</th>
                    <th className="hidden px-4 py-3 font-medium sm:table-cell">Tipo</th>
                    <th className="hidden px-4 py-3 font-medium sm:table-cell">Rastreabilidade</th>
                    <th className="px-4 py-3 text-right font-medium">Valor</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-300 dark:divide-neutral-800">
                  {pageItems.map((transaction) => (
                    <tr key={transaction.id}>
                      <td className="hidden px-4 py-3 text-neutral-600 sm:table-cell dark:text-neutral-300">
                        {new Date(`${transaction.date}T00:00:00`).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-4 py-3 text-neutral-800 dark:text-neutral-100">
                        {transaction.description}
                        <span className="mt-1 flex sm:hidden">
                          <VaultTypeBadge type={transaction.type} />
                        </span>
                        <span className="mt-0.5 block text-xs text-neutral-500 sm:hidden dark:text-neutral-400">
                          {new Date(`${transaction.date}T00:00:00`).toLocaleDateString("pt-BR")}
                          {transaction.type === "DEPOSIT_CARVE" && ` · ${traceability(transaction)}`}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 sm:table-cell">
                        <VaultTypeBadge type={transaction.type} />
                      </td>
                      <td className="hidden px-4 py-3 text-neutral-500 sm:table-cell dark:text-neutral-400">
                        {traceability(transaction)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium">
                        <span
                          className={
                            transaction.type === "WITHDRAWAL"
                              ? "text-red-600 dark:text-red-400"
                              : "text-cartuga-700 dark:text-cartuga-300"
                          }
                        >
                          {transaction.type === "WITHDRAWAL" ? "− " : "+ "}
                          <CurrencyAmount amount={transaction.amount} />
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <button
                            onClick={() => setPendingDelete(transaction)}
                            aria-label="Excluir movimentação"
                            className={deleteIconClass}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                page={page}
                totalPages={totalPages}
                totalItems={totalItems}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </div>
          )}
        </>
      )}

      <VaultTransactionFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
        action={formAction}
        loading={createMutation.isPending}
        availableBalance={summaryQuery.data?.balance}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Excluir movimentação?"
        message="Isso também remove o registro correspondente de entrada/saída. Esta ação não poderá ser desfeita."
        confirmLabel="Excluir"
        loading={deleteMutation.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
      />
    </div>
  );
}
