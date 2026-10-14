import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CurrencyAmount } from "../components/CurrencyAmount";
import { EmptyState } from "../components/EmptyState";
import { EntryDetailModal } from "../components/entries/EntryDetailModal";
import { EntryFormModal } from "../components/entries/EntryFormModal";
import { ErrorState } from "../components/ErrorState";
import { Spinner } from "../components/Spinner";
import { FilterChips } from "../components/table/FilterChips";
import { PencilIcon, TrashIcon, VaultIcon } from "../components/table/icons";
import { MonthFilter } from "../components/table/MonthFilter";
import { Pagination } from "../components/table/Pagination";
import { PlannedBadge } from "../components/table/PlannedBadge";
import { SearchInput } from "../components/table/SearchInput";
import { SortableHeader } from "../components/table/SortableHeader";
import { TypeBadge } from "../components/table/TypeBadge";
import { usePagination } from "../hooks/usePagination";
import { useToast } from "../hooks/useToast";
import { extractErrorMessage } from "../services/api";
import { createEntry, deleteEntry, listEntries, updateEntry } from "../services/entriesApi";
import type { Entry, EntryInput, RecurrenceType } from "../types";
import { formatDateRange } from "../utils/formatDateRange";
import { isInvestmentSource } from "../utils/isInvestment";
import { matchesMonth } from "../utils/matchesMonth";

type TypeFilter = "ALL" | RecurrenceType;
type SortKey = "description" | "date" | "amount";

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "ALL", label: "Todos" },
  { value: "FIXED", label: "Fixa" },
  { value: "EXCEPTIONAL", label: "Excepcional" },
];

const editIconClass =
  "rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200";
const deleteIconClass =
  "rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300";

function compareEntries(a: Entry, b: Entry, key: SortKey): number {
  if (key === "description") return a.description.localeCompare(b.description, "pt-BR");
  if (key === "amount") return parseFloat(a.amount) - parseFloat(b.amount);
  return a.date.localeCompare(b.date);
}

export function EntriesPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Entry | null>(null);
  const [inspecting, setInspecting] = useState<Entry | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [monthFilter, setMonthFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["entries"],
    queryFn: listEntries,
  });

  const filteredSorted = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    const filtered = data.filter((entry) => {
      if (typeFilter !== "ALL" && entry.type !== typeFilter) return false;
      if (!matchesMonth(entry, monthFilter)) return false;
      if (!query) return true;
      return entry.description.toLowerCase().includes(query) || entry.source.toLowerCase().includes(query);
    });
    const sorted = [...filtered].sort((a, b) => compareEntries(a, b, sortKey));
    if (sortDir === "desc") sorted.reverse();
    return sorted;
  }, [data, search, typeFilter, monthFilter, sortKey, sortDir]);

  const { page, setPage, totalPages, pageItems, pageSize, setPageSize, totalItems } =
    usePagination(filteredSorted);

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, monthFilter, sortKey, sortDir, setPage]);

  const createMutation = useMutation({
    mutationFn: (payload: EntryInput) => createEntry(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      // Creating a future-dated Planejado entry here should update the pending-review
      // badge/list even if the user never opens the Planejamentos tab.
      queryClient.invalidateQueries({ queryKey: ["planning"] });
      showToast("Entrada criada com sucesso.", "success");
      setFormOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: EntryInput) => updateEntry(editing!.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      // A vault-locked entry's description edit also updates the linked
      // vault_transaction (see entry_service) - keep the Cofre screen in sync too.
      queryClient.invalidateQueries({ queryKey: ["vault"] });
      // Editing here can flip is_planned (e.g. confirming one) - keep the
      // pending-review badge/list in sync too.
      queryClient.invalidateQueries({ queryKey: ["planning"] });
      showToast("Entrada atualizada com sucesso.", "success");
      setFormOpen(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      // Deleting a Cofre-generated entry also deletes its vault_transaction (DB
      // cascade) - keep the Cofre screen in sync too.
      queryClient.invalidateQueries({ queryKey: ["vault"] });
      // Deleting a planned entry here should also drop it from pending-review.
      queryClient.invalidateQueries({ queryKey: ["planning"] });
      showToast("Entrada excluída.", "success");
      setPendingDelete(null);
    },
    onError: (err) => {
      showToast(extractErrorMessage(err, "Não foi possível excluir a entrada."), "error");
      setPendingDelete(null);
    },
  });

  async function handleSubmit(payload: EntryInput) {
    try {
      if (editing) {
        await updateMutation.mutateAsync(payload);
      } else {
        await createMutation.mutateAsync(payload);
      }
    } catch (err) {
      throw new Error(extractErrorMessage(err, "Não foi possível salvar a entrada."));
    }
  }

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(entry: Entry) {
    setEditing(entry);
    setFormOpen(true);
  }

  function openConfirmPlanned(entry: Entry) {
    // Pre-fills the edit form with "Planejado" already unchecked - saving finalizes
    // it as the real value, exactly like manually confirming would.
    setEditing({ ...entry, is_planned: false });
    setFormOpen(true);
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "description" ? "asc" : "desc");
    }
  }

  function clearFilters() {
    setSearch("");
    setTypeFilter("ALL");
    setMonthFilter("");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Entradas</h1>
        <Button onClick={openCreate}>+ Nova entrada</Button>
      </div>

      {isLoading && <Spinner label="Carregando entradas..." />}
      {isError && <ErrorState message="Não foi possível carregar as entradas." onRetry={() => refetch()} />}

      {!isLoading && !isError && data && data.length === 0 && (
        <EmptyState
          title="Nenhuma entrada cadastrada"
          description="Registre salários, freelas e outras receitas para começar a acompanhar seu saldo."
          action={<Button onClick={openCreate}>Criar primeira entrada</Button>}
        />
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar por descrição ou fonte..." />
            <MonthFilter value={monthFilter} onChange={setMonthFilter} />
            <FilterChips
              options={TYPE_OPTIONS}
              value={typeFilter}
              onChange={setTypeFilter}
              aria-label="Filtrar por tipo"
              className="sm:ml-auto"
            />
          </div>

          {totalItems === 0 ? (
            <EmptyState
              title="Nenhum resultado encontrado"
              description="Nenhuma entrada corresponde à busca ou aos filtros aplicados."
              action={
                <Button variant="secondary" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-neutral-300 bg-[var(--color-surface)] dark:border-neutral-800">
              <table className="w-full text-left text-sm sm:min-w-[640px]">
                <thead className="bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
                  <tr>
                    <SortableHeader sortKey="description" activeKey={sortKey} direction={sortDir} onSort={handleSort}>
                      Descrição
                    </SortableHeader>
                    <th className="hidden px-4 py-3 font-medium sm:table-cell">Fonte</th>
                    <th className="hidden px-4 py-3 font-medium sm:table-cell">Tipo</th>
                    <SortableHeader
                      sortKey="date"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={handleSort}
                      className="hidden sm:table-cell"
                    >
                      Período
                    </SortableHeader>
                    <SortableHeader
                      sortKey="amount"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={handleSort}
                      align="right"
                    >
                      Valor
                    </SortableHeader>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-300 dark:divide-neutral-800">
                  {pageItems.map((entry) => (
                    <tr
                      key={entry.id}
                      onClick={() => setInspecting(entry)}
                      className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                    >
                      <td className="px-4 py-3 text-neutral-800 dark:text-neutral-100">
                        <span className="flex items-center gap-1.5">
                          {entry.description}
                          {isInvestmentSource(entry.source) && (
                            <span title="Investimento" className="inline-flex shrink-0">
                              <VaultIcon className="h-3.5 w-3.5 text-cartuga-600 dark:text-cartuga-400" />
                            </span>
                          )}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1 sm:hidden">
                          <TypeBadge type={entry.type} />
                          {entry.is_planned && <PlannedBadge />}
                        </span>
                        <span className="mt-0.5 block text-xs text-neutral-500 sm:hidden dark:text-neutral-400">
                          {entry.source} · {formatDateRange(entry)}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-neutral-600 sm:table-cell dark:text-neutral-300">{entry.source}</td>
                      <td className="hidden px-4 py-3 sm:table-cell">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <TypeBadge type={entry.type} />
                          {entry.is_planned && <PlannedBadge />}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-neutral-600 sm:table-cell dark:text-neutral-300">{formatDateRange(entry)}</td>
                      <td className="px-4 py-3 text-right font-medium">
                        <CurrencyAmount amount={entry.amount} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(entry);
                            }}
                            aria-label="Editar entrada"
                            className={editIconClass}
                          >
                            <PencilIcon />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPendingDelete(entry);
                            }}
                            aria-label="Excluir entrada"
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

      <EntryFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSubmit}
        initial={editing}
        loading={createMutation.isPending || updateMutation.isPending}
      />

      <EntryDetailModal
        entry={inspecting}
        onClose={() => setInspecting(null)}
        onEdit={(entry) => {
          setInspecting(null);
          openEdit(entry);
        }}
        onDelete={(entry) => {
          setInspecting(null);
          setPendingDelete(entry);
        }}
        onConfirm={(entry) => {
          setInspecting(null);
          openConfirmPlanned(entry);
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Excluir entrada?"
        message={
          pendingDelete?.is_vault_locked
            ? "Esta entrada foi gerada pelo Cofre. Excluí-la também remove a movimentação correspondente de lá. Esta ação não poderá ser desfeita."
            : "Esta ação não poderá ser desfeita."
        }
        confirmLabel="Excluir"
        loading={deleteMutation.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
      />
    </div>
  );
}
