import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "../Button";
import { ConfirmDialog } from "../ConfirmDialog";
import { ErrorState } from "../ErrorState";
import { Spinner } from "../Spinner";
import { EntryDetailModal } from "../entries/EntryDetailModal";
import { EntryFormModal } from "../entries/EntryFormModal";
import { ExpenseDetailModal } from "../expenses/ExpenseDetailModal";
import { ExpenseFormModal } from "../expenses/ExpenseFormModal";
import { InstallmentsModal } from "../expenses/InstallmentsModal";
import { ExternalLinkIcon } from "../table/icons";
import { monthFull } from "../../charts/monthLabels";
import { useToast } from "../../hooks/useToast";
import { extractErrorMessage } from "../../services/api";
import { getMonthDetail } from "../../services/dashboardApi";
import { createEntry, deleteEntry, updateEntry } from "../../services/entriesApi";
import { createExpense, deleteExpense, listExpenses, updateExpense } from "../../services/expensesApi";
import type { Entry, EntryInput, Expense, ExpenseInput, Installment, MonthExpenseLine } from "../../types";
import { EntryMiniTable } from "./EntryMiniTable";
import { ExpenseMiniTable } from "./ExpenseMiniTable";

const RECENT_LIMIT = 5;

interface CurrentMonthSectionProps {
  year: number;
  month: number;
}

const linkButtonClass =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-neutral-300 text-neutral-500 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800";

export function CurrentMonthSection({ year, month }: CurrentMonthSectionProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [entryFormOpen, setEntryFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [inspectingEntry, setInspectingEntry] = useState<Entry | null>(null);
  const [pendingDeleteEntry, setPendingDeleteEntry] = useState<Entry | null>(null);

  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [inspectingExpense, setInspectingExpense] = useState<Expense | null>(null);
  const [highlightInstallment, setHighlightInstallment] = useState<Installment | null>(null);
  const [pendingDeleteExpense, setPendingDeleteExpense] = useState<Expense | null>(null);
  const [installmentsExpenseId, setInstallmentsExpenseId] = useState<number | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard", "month", year, month],
    queryFn: () => getMonthDetail(year, month),
  });

  // The month's expense lines are flattened (a CREDITO installment isn't itself an
  // Expense) - inspecting one needs the real, full Expense they point back to via
  // expense_id, already cached from the Saídas page in the common case.
  const expensesQuery = useQuery({ queryKey: ["expenses"], queryFn: listExpenses });
  const selectedInstallmentsExpense = expensesQuery.data?.find((e) => e.id === installmentsExpenseId) ?? null;

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["entries"] });
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
    // Creating/editing/deleting here can add, confirm, or drop a Planejado record -
    // keep the pending-review badge/list in sync even off the Planejamentos tab.
    queryClient.invalidateQueries({ queryKey: ["planning"] });
  }

  const createEntryMutation = useMutation({
    mutationFn: (payload: EntryInput) => createEntry(payload),
    onSuccess: () => {
      invalidateAll();
      showToast("Entrada criada com sucesso.", "success");
      setEntryFormOpen(false);
    },
  });

  const updateEntryMutation = useMutation({
    mutationFn: (payload: EntryInput) => updateEntry(editingEntry!.id, payload),
    onSuccess: () => {
      invalidateAll();
      showToast("Entrada atualizada com sucesso.", "success");
      setEntryFormOpen(false);
      setEditingEntry(null);
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: (id: number) => deleteEntry(id),
    onSuccess: () => {
      invalidateAll();
      showToast("Entrada excluída.", "success");
      setPendingDeleteEntry(null);
    },
    onError: (err) => {
      showToast(extractErrorMessage(err, "Não foi possível excluir a entrada."), "error");
      setPendingDeleteEntry(null);
    },
  });

  const createExpenseMutation = useMutation({
    mutationFn: (payload: ExpenseInput) => createExpense(payload),
    onSuccess: () => {
      invalidateAll();
      showToast("Saída criada com sucesso.", "success");
      setExpenseFormOpen(false);
    },
  });

  const updateExpenseMutation = useMutation({
    mutationFn: (payload: ExpenseInput) => updateExpense(editingExpense!.id, payload),
    onSuccess: () => {
      invalidateAll();
      showToast("Saída atualizada com sucesso.", "success");
      setExpenseFormOpen(false);
      setEditingExpense(null);
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: (id: number) => deleteExpense(id),
    onSuccess: () => {
      invalidateAll();
      showToast("Saída excluída.", "success");
      setPendingDeleteExpense(null);
    },
    onError: (err) => {
      showToast(extractErrorMessage(err, "Não foi possível excluir a saída."), "error");
      setPendingDeleteExpense(null);
    },
  });

  async function handleEntrySubmit(payload: EntryInput) {
    try {
      if (editingEntry) {
        await updateEntryMutation.mutateAsync(payload);
      } else {
        await createEntryMutation.mutateAsync(payload);
      }
    } catch (err) {
      throw new Error(extractErrorMessage(err, "Não foi possível salvar a entrada."));
    }
  }

  async function handleExpenseSubmit(payload: ExpenseInput) {
    try {
      if (editingExpense) {
        await updateExpenseMutation.mutateAsync(payload);
      } else {
        await createExpenseMutation.mutateAsync(payload);
      }
    } catch (err) {
      throw new Error(extractErrorMessage(err, "Não foi possível salvar a saída."));
    }
  }

  function openNewEntry() {
    setEditingEntry(null);
    setEntryFormOpen(true);
  }

  function openNewExpense() {
    setEditingExpense(null);
    setExpenseFormOpen(true);
  }

  function handleExpenseLineClick(line: MonthExpenseLine) {
    const expense = expensesQuery.data?.find((e) => e.id === line.expense_id);
    if (expense) {
      setInspectingExpense(expense);
      setHighlightInstallment(line.installment);
    }
  }

  const monthName = monthFull(month).toLowerCase();

  const recentEntries = useMemo(() => {
    if (!data) return [];
    return [...data.entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, RECENT_LIMIT);
  }, [data]);

  const recentExpenses = useMemo(() => {
    if (!data) return [];
    return [...data.expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, RECENT_LIMIT);
  }, [data]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-neutral-300 bg-[var(--color-surface)] p-5 dark:border-neutral-800">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Entradas de {monthName}</h3>
          <div className="flex items-center gap-2">
            <Link to="/entries" title="Ver todas as entradas" className={linkButtonClass}>
              <ExternalLinkIcon className="h-3.5 w-3.5" />
            </Link>
            <Button variant="secondary" onClick={openNewEntry} className="!px-2.5 !py-1 text-xs">
              + Nova entrada
            </Button>
          </div>
        </div>
        {isLoading && <Spinner label="Carregando..." />}
        {isError && <ErrorState message="Não foi possível carregar as entradas." onRetry={() => refetch()} />}
        {data && (
          <EntryMiniTable
            entries={recentEntries}
            emptyLabel={`Nenhuma entrada em ${monthName}.`}
            onRowClick={setInspectingEntry}
          />
        )}
      </div>

      <div className="rounded-xl border border-neutral-300 bg-[var(--color-surface)] p-5 dark:border-neutral-800">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Saídas de {monthName}</h3>
          <div className="flex items-center gap-2">
            <Link to="/expenses" title="Ver todas as saídas" className={linkButtonClass}>
              <ExternalLinkIcon className="h-3.5 w-3.5" />
            </Link>
            <Button variant="secondary" onClick={openNewExpense} className="!px-2.5 !py-1 text-xs">
              + Nova saída
            </Button>
          </div>
        </div>
        {isLoading && <Spinner label="Carregando..." />}
        {isError && <ErrorState message="Não foi possível carregar as saídas." onRetry={() => refetch()} />}
        {data && (
          <ExpenseMiniTable
            expenses={recentExpenses}
            emptyLabel={`Nenhuma saída em ${monthName}.`}
            onRowClick={handleExpenseLineClick}
          />
        )}
      </div>

      <EntryFormModal
        open={entryFormOpen}
        onClose={() => {
          setEntryFormOpen(false);
          setEditingEntry(null);
        }}
        onSubmit={handleEntrySubmit}
        initial={editingEntry}
        loading={createEntryMutation.isPending || updateEntryMutation.isPending}
      />
      <EntryDetailModal
        entry={inspectingEntry}
        onClose={() => setInspectingEntry(null)}
        onEdit={(entry) => {
          setInspectingEntry(null);
          setEditingEntry(entry);
          setEntryFormOpen(true);
        }}
        onDelete={(entry) => {
          setInspectingEntry(null);
          setPendingDeleteEntry(entry);
        }}
        onConfirm={(entry) => {
          setInspectingEntry(null);
          setEditingEntry({ ...entry, is_planned: false });
          setEntryFormOpen(true);
        }}
      />
      <ConfirmDialog
        open={pendingDeleteEntry !== null}
        title="Excluir entrada?"
        message="Esta ação não poderá ser desfeita."
        confirmLabel="Excluir"
        loading={deleteEntryMutation.isPending}
        onCancel={() => setPendingDeleteEntry(null)}
        onConfirm={() => pendingDeleteEntry && deleteEntryMutation.mutate(pendingDeleteEntry.id)}
      />

      <ExpenseFormModal
        open={expenseFormOpen}
        onClose={() => {
          setExpenseFormOpen(false);
          setEditingExpense(null);
        }}
        onSubmit={handleExpenseSubmit}
        initial={editingExpense}
        loading={createExpenseMutation.isPending || updateExpenseMutation.isPending}
      />
      <ExpenseDetailModal
        expense={inspectingExpense}
        highlightInstallment={highlightInstallment}
        onClose={() => setInspectingExpense(null)}
        onEdit={(expense) => {
          setInspectingExpense(null);
          setEditingExpense(expense);
          setExpenseFormOpen(true);
        }}
        onDelete={(expense) => {
          setInspectingExpense(null);
          setPendingDeleteExpense(expense);
        }}
        onShowInstallments={(expense) => {
          setInspectingExpense(null);
          setInstallmentsExpenseId(expense.id);
        }}
        onConfirm={(expense) => {
          setInspectingExpense(null);
          setEditingExpense({ ...expense, is_planned: false });
          setExpenseFormOpen(true);
        }}
      />
      <InstallmentsModal
        open={installmentsExpenseId !== null}
        onClose={() => setInstallmentsExpenseId(null)}
        expense={selectedInstallmentsExpense}
      />
      <ConfirmDialog
        open={pendingDeleteExpense !== null}
        title="Excluir saída?"
        message="Esta ação não poderá ser desfeita. Parcelas e ajustes associados também serão excluídos."
        confirmLabel="Excluir"
        loading={deleteExpenseMutation.isPending}
        onCancel={() => setPendingDeleteExpense(null)}
        onConfirm={() => pendingDeleteExpense && deleteExpenseMutation.mutate(pendingDeleteExpense.id)}
      />
    </div>
  );
}
