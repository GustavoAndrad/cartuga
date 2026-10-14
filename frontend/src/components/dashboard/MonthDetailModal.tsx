import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { ConfirmDialog } from "../ConfirmDialog";
import { CurrencyAmount } from "../CurrencyAmount";
import { ErrorState } from "../ErrorState";
import { Modal } from "../Modal";
import { Spinner } from "../Spinner";
import { Pagination } from "../table/Pagination";
import { EntryDetailModal } from "../entries/EntryDetailModal";
import { EntryFormModal } from "../entries/EntryFormModal";
import { ExpenseDetailModal } from "../expenses/ExpenseDetailModal";
import { ExpenseFormModal } from "../expenses/ExpenseFormModal";
import { InstallmentsModal } from "../expenses/InstallmentsModal";
import { monthFull } from "../../charts/monthLabels";
import { usePagination } from "../../hooks/usePagination";
import { useToast } from "../../hooks/useToast";
import { extractErrorMessage } from "../../services/api";
import { getMonthDetail } from "../../services/dashboardApi";
import { deleteEntry, updateEntry } from "../../services/entriesApi";
import { deleteExpense, listExpenses, updateExpense } from "../../services/expensesApi";
import type { Entry, EntryInput, Expense, ExpenseInput, Installment, MonthExpenseLine } from "../../types";
import { CalculationModal, type CalculationMode } from "./CalculationModal";
import { DistributionPieChart } from "./DistributionPieChart";
import { EntryMiniTable } from "./EntryMiniTable";
import { ExpenseMiniTable } from "./ExpenseMiniTable";

const LIST_PAGE_SIZE = 5;
const LIST_PAGE_SIZE_OPTIONS = [5, 10, 25];
const NO_ENTRIES: Entry[] = [];
const NO_EXPENSES: MonthExpenseLine[] = [];

interface MonthDetailModalProps {
  month: { year: number; month: number } | null;
  onClose: () => void;
}

function CalcButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 text-xs font-medium text-cartuga-600 hover:underline dark:text-cartuga-400"
    >
      Ver cálculo
    </button>
  );
}

export function MonthDetailModal({ month, onClose }: MonthDetailModalProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [calcMode, setCalcMode] = useState<CalculationMode | null>(null);

  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [inspectingEntry, setInspectingEntry] = useState<Entry | null>(null);
  const [pendingDeleteEntry, setPendingDeleteEntry] = useState<Entry | null>(null);

  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [inspectingExpense, setInspectingExpense] = useState<Expense | null>(null);
  const [highlightInstallment, setHighlightInstallment] = useState<Installment | null>(null);
  const [pendingDeleteExpense, setPendingDeleteExpense] = useState<Expense | null>(null);
  const [installmentsExpenseId, setInstallmentsExpenseId] = useState<number | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard", "month", month?.year, month?.month],
    queryFn: () => getMonthDetail(month!.year, month!.month),
    enabled: month !== null,
  });

  const entriesPage = usePagination(data?.entries ?? NO_ENTRIES, LIST_PAGE_SIZE);
  const expensesPage = usePagination(data?.expenses ?? NO_EXPENSES, LIST_PAGE_SIZE);
  const { setPage: setEntriesPage } = entriesPage;
  const { setPage: setExpensesPage } = expensesPage;

  // Opening another month starts both lists over from their first page.
  useEffect(() => {
    setEntriesPage(1);
    setExpensesPage(1);
  }, [month?.year, month?.month, setEntriesPage, setExpensesPage]);

  // The month's expense lines are flattened (a CREDITO installment isn't itself an
  // Expense) - inspecting/editing one needs the real, full Expense they point back to
  // via expense_id, already cached from the Saídas page in the common case.
  const expensesQuery = useQuery({ queryKey: ["expenses"], queryFn: listExpenses, enabled: month !== null });

  const monthLabel = month ? `${monthFull(month.month)} de ${month.year}` : "";

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["entries"] });
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
    // Editing/deleting here can confirm or drop a Planejado record - keep the
    // pending-review badge/list in sync even off the Planejamentos tab.
    queryClient.invalidateQueries({ queryKey: ["planning"] });
  }

  const updateEntryMutation = useMutation({
    mutationFn: (payload: EntryInput) => updateEntry(editingEntry!.id, payload),
    onSuccess: () => {
      invalidateAll();
      showToast("Entrada atualizada com sucesso.", "success");
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

  const updateExpenseMutation = useMutation({
    mutationFn: (payload: ExpenseInput) => updateExpense(editingExpense!.id, payload),
    onSuccess: () => {
      invalidateAll();
      showToast("Saída atualizada com sucesso.", "success");
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
      await updateEntryMutation.mutateAsync(payload);
    } catch (err) {
      throw new Error(extractErrorMessage(err, "Não foi possível salvar a entrada."));
    }
  }

  async function handleExpenseSubmit(payload: ExpenseInput) {
    try {
      await updateExpenseMutation.mutateAsync(payload);
    } catch (err) {
      throw new Error(extractErrorMessage(err, "Não foi possível salvar a saída."));
    }
  }

  function openExpenseLine(line: MonthExpenseLine) {
    const expense = expensesQuery.data?.find((e) => e.id === line.expense_id);
    if (expense) {
      setInspectingExpense(expense);
      setHighlightInstallment(line.installment);
    }
  }

  const selectedInstallmentsExpense = expensesQuery.data?.find((e) => e.id === installmentsExpenseId) ?? null;

  return (
    <>
      <Modal open={month !== null} onClose={onClose} title={monthLabel} size="xl">
        {isLoading && <Spinner label="Carregando detalhe do mês..." />}
        {isError && <ErrorState message="Não foi possível carregar o detalhe do mês." onRetry={() => refetch()} />}

        {data && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-neutral-50 p-4 text-center dark:bg-neutral-800/60">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  Entradas
                </p>
                <CurrencyAmount amount={data.entries_total} className="mt-1 block text-xl font-semibold" />
                <CalcButton onClick={() => setCalcMode("entries")} />
              </div>
              <div className="rounded-xl bg-neutral-50 p-4 text-center dark:bg-neutral-800/60">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  Saídas
                </p>
                <CurrencyAmount amount={data.expenses_total} className="mt-1 block text-xl font-semibold" />
                <CalcButton onClick={() => setCalcMode("expenses")} />
              </div>
              <div className="rounded-xl bg-cartuga-50 p-4 text-center dark:bg-cartuga-900/30">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  Saldo do mês
                </p>
                <CurrencyAmount
                  amount={data.balance}
                  className="mt-1 block text-xl font-semibold"
                  colorize
                />
                <CalcButton onClick={() => setCalcMode("balance")} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <DistributionPieChart title="Distribuição das entradas" distribution={data.entries_distribution} />
              <DistributionPieChart title="Distribuição das saídas" distribution={data.expenses_distribution} />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-semibold text-neutral-800 dark:text-neutral-100">Entradas</h3>
                <EntryMiniTable entries={entriesPage.pageItems} onRowClick={setInspectingEntry} />
                <Pagination
                  id="month-entries-page-size"
                  page={entriesPage.page}
                  totalPages={entriesPage.totalPages}
                  totalItems={entriesPage.totalItems}
                  pageSize={entriesPage.pageSize}
                  pageSizeOptions={LIST_PAGE_SIZE_OPTIONS}
                  onPageChange={entriesPage.setPage}
                  onPageSizeChange={entriesPage.setPageSize}
                />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-neutral-800 dark:text-neutral-100">Saídas</h3>
                <ExpenseMiniTable expenses={expensesPage.pageItems} onRowClick={openExpenseLine} />
                <Pagination
                  id="month-expenses-page-size"
                  page={expensesPage.page}
                  totalPages={expensesPage.totalPages}
                  totalItems={expensesPage.totalItems}
                  pageSize={expensesPage.pageSize}
                  pageSizeOptions={LIST_PAGE_SIZE_OPTIONS}
                  onPageChange={expensesPage.setPage}
                  onPageSizeChange={expensesPage.setPageSize}
                />
              </div>
            </div>
          </div>
        )}
      </Modal>

      {data && calcMode && (
        <CalculationModal
          open={calcMode !== null}
          onClose={() => setCalcMode(null)}
          mode={calcMode}
          monthLabel={monthLabel}
          entries={data.entries}
          expenses={data.expenses}
          onOpenEntry={setInspectingEntry}
          onOpenExpense={openExpenseLine}
        />
      )}

      <EntryDetailModal
        entry={inspectingEntry}
        onClose={() => setInspectingEntry(null)}
        onEdit={(entry) => {
          setInspectingEntry(null);
          setEditingEntry(entry);
        }}
        onDelete={(entry) => {
          setInspectingEntry(null);
          setPendingDeleteEntry(entry);
        }}
        onConfirm={(entry) => {
          setInspectingEntry(null);
          setEditingEntry({ ...entry, is_planned: false });
        }}
      />
      <EntryFormModal
        open={editingEntry !== null}
        onClose={() => setEditingEntry(null)}
        onSubmit={handleEntrySubmit}
        initial={editingEntry}
        loading={updateEntryMutation.isPending}
      />
      <ConfirmDialog
        open={pendingDeleteEntry !== null}
        title="Excluir entrada?"
        message={
          pendingDeleteEntry?.is_vault_locked
            ? "Esta entrada foi gerada pelo Cofre. Excluí-la também remove a movimentação correspondente de lá. Esta ação não poderá ser desfeita."
            : "Esta ação não poderá ser desfeita."
        }
        confirmLabel="Excluir"
        loading={deleteEntryMutation.isPending}
        onCancel={() => setPendingDeleteEntry(null)}
        onConfirm={() => pendingDeleteEntry && deleteEntryMutation.mutate(pendingDeleteEntry.id)}
      />

      <ExpenseDetailModal
        expense={inspectingExpense}
        highlightInstallment={highlightInstallment}
        onClose={() => setInspectingExpense(null)}
        onEdit={(expense) => {
          setInspectingExpense(null);
          setEditingExpense(expense);
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
        }}
      />
      <ExpenseFormModal
        open={editingExpense !== null}
        onClose={() => setEditingExpense(null)}
        onSubmit={handleExpenseSubmit}
        initial={editingExpense}
        loading={updateExpenseMutation.isPending}
      />
      <InstallmentsModal
        open={installmentsExpenseId !== null}
        onClose={() => setInstallmentsExpenseId(null)}
        expense={selectedInstallmentsExpense}
      />
      <ConfirmDialog
        open={pendingDeleteExpense !== null}
        title="Excluir saída?"
        message={
          pendingDeleteExpense?.is_vault_locked
            ? "Esta saída foi gerada por um recorte do Cofre. Excluí-la também remove a movimentação correspondente de lá. Esta ação não poderá ser desfeita."
            : "Esta ação não poderá ser desfeita. Parcelas e ajustes associados também serão excluídos."
        }
        confirmLabel="Excluir"
        loading={deleteExpenseMutation.isPending}
        onCancel={() => setPendingDeleteExpense(null)}
        onConfirm={() => pendingDeleteExpense && deleteExpenseMutation.mutate(pendingDeleteExpense.id)}
      />
    </>
  );
}
