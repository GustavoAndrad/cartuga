import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CurrencyAmount } from "../components/CurrencyAmount";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { Spinner } from "../components/Spinner";
import { EntryDetailModal } from "../components/entries/EntryDetailModal";
import { EntryFormModal } from "../components/entries/EntryFormModal";
import { ExpenseDetailModal } from "../components/expenses/ExpenseDetailModal";
import { ExpenseFormModal } from "../components/expenses/ExpenseFormModal";
import { OccurrenceConfirmModal } from "../components/planning/OccurrenceConfirmModal";
import { PlannedBalanceChart, PlannedMonthlyChart } from "../components/planning/PlannedComparisonCharts";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, ClockIcon, TrashIcon } from "../components/table/icons";
import { TypeBadge } from "../components/table/TypeBadge";
import { monthFull } from "../charts/monthLabels";
import { toMonthIndex } from "../charts/monthWindow";
import type { ChartWindowSource } from "../hooks/useChartWindow";
import { useToast } from "../hooks/useToast";
import { extractErrorMessage } from "../services/api";
import { confirmEntryOccurrence, deleteEntry, rejectEntryOccurrence, updateEntry } from "../services/entriesApi";
import { confirmExpenseOccurrence, deleteExpense, rejectExpenseOccurrence, updateExpense } from "../services/expensesApi";
import { getPendingReview, getPlannedComparison } from "../services/planningApi";
import type {
  Entry,
  EntryInput,
  Expense,
  ExpenseInput,
  PendingEntryItem,
  PendingExpenseItem,
  PlannedComparison,
} from "../types";
import { todayIso } from "../utils/today";

type PlanningItem =
  | ({ kind: "entry"; id: number; data: Entry } & Omit<PendingEntryItem, "entry">)
  | ({ kind: "expense"; id: number; data: Expense } & Omit<PendingExpenseItem, "expense">);

/** A FIXED entry/expense's specific monthly occurrence - as opposed to a one-off
 * EXCEPTIONAL record, which has no occurrence_year/month (see PendingReviewOut). */
function isFixedOccurrence(item: PlanningItem): boolean {
  return item.occurrence_year !== null && item.occurrence_month !== null;
}

function tomorrowIso(): string {
  const d = new Date(`${todayIso()}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function dateGroupLabel(dateStr: string, items: PlanningItem[]): { title: string; tag: string | null } {
  // A FIXED occurrence's review_date is just the 1st of its month (there's no single
  // calendar day to point at, unlike an EXCEPTIONAL record's own `date`) - label and
  // compare it month-to-month instead of day-to-day, or every current-month
  // occurrence would misleadingly show as "Atrasado" just for not being the 1st today.
  if (items.every(isFixedOccurrence)) {
    const [year, month] = dateStr.split("-").map(Number);
    const title = `${monthFull(month)} de ${year}`;
    const todayMonthKey = todayIso().slice(0, 7);
    const groupMonthKey = dateStr.slice(0, 7);
    if (groupMonthKey === todayMonthKey) return { title, tag: "Este mês" };
    if (groupMonthKey < todayMonthKey) return { title, tag: "Atrasado" };
    return { title, tag: "Próximo mês" };
  }

  const title = new Date(`${dateStr}T00:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  if (dateStr === todayIso()) return { title, tag: "Hoje" };
  if (dateStr === tomorrowIso()) return { title, tag: "Amanhã" };
  if (dateStr < todayIso()) return { title, tag: "Atrasado" };
  return { title, tag: null };
}

export function PlanningPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["planning", "pending"],
    queryFn: getPendingReview,
  });

  const comparisonQuery = useQuery({
    queryKey: ["planning", "comparison"],
    queryFn: () => getPlannedComparison(3, 12),
  });

  const [inspectingEntry, setInspectingEntry] = useState<Entry | null>(null);
  const [inspectingExpense, setInspectingExpense] = useState<Expense | null>(null);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [rejecting, setRejecting] = useState<PlanningItem | null>(null);
  const [confirmingOccurrence, setConfirmingOccurrence] = useState<PlanningItem | null>(null);

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["planning"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["entries"] });
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
  }

  const updateEntryMutation = useMutation({
    mutationFn: (payload: EntryInput) => updateEntry(editingEntry!.id, payload),
    onSuccess: () => {
      invalidateAll();
      showToast("Entrada confirmada.", "success");
      setEditingEntry(null);
    },
  });

  const updateExpenseMutation = useMutation({
    mutationFn: (payload: ExpenseInput) => updateExpense(editingExpense!.id, payload),
    onSuccess: () => {
      invalidateAll();
      showToast("Saída confirmada.", "success");
      setEditingExpense(null);
    },
  });

  const rejectEntryMutation = useMutation({
    mutationFn: (id: number) => deleteEntry(id),
    onSuccess: () => {
      invalidateAll();
      showToast("Planejamento recusado.", "success");
      setRejecting(null);
    },
    onError: (err) => {
      showToast(extractErrorMessage(err, "Não foi possível recusar o planejamento."), "error");
      setRejecting(null);
    },
  });

  const rejectExpenseMutation = useMutation({
    mutationFn: (id: number) => deleteExpense(id),
    onSuccess: () => {
      invalidateAll();
      showToast("Planejamento recusado.", "success");
      setRejecting(null);
    },
    onError: (err) => {
      showToast(extractErrorMessage(err, "Não foi possível recusar o planejamento."), "error");
      setRejecting(null);
    },
  });

  const rejectEntryOccurrenceMutation = useMutation({
    mutationFn: ({ id, year, month }: { id: number; year: number; month: number }) =>
      rejectEntryOccurrence(id, year, month),
    onSuccess: () => {
      invalidateAll();
      showToast("Mês recusado: deixou de contar no saldo.", "success");
      setRejecting(null);
    },
    onError: (err) => {
      showToast(extractErrorMessage(err, "Não foi possível recusar este mês."), "error");
      setRejecting(null);
    },
  });

  const rejectExpenseOccurrenceMutation = useMutation({
    mutationFn: ({ id, year, month }: { id: number; year: number; month: number }) =>
      rejectExpenseOccurrence(id, year, month),
    onSuccess: () => {
      invalidateAll();
      showToast("Mês recusado: deixou de contar no saldo.", "success");
      setRejecting(null);
    },
    onError: (err) => {
      showToast(extractErrorMessage(err, "Não foi possível recusar este mês."), "error");
      setRejecting(null);
    },
  });

  const confirmEntryOccurrenceMutation = useMutation({
    mutationFn: ({ id, year, month, amount }: { id: number; year: number; month: number; amount: string | null }) =>
      confirmEntryOccurrence(id, year, month, amount),
    onSuccess: () => {
      invalidateAll();
      showToast("Mês confirmado.", "success");
      setConfirmingOccurrence(null);
    },
    onError: (err) => showToast(extractErrorMessage(err, "Não foi possível confirmar este mês."), "error"),
  });

  const confirmExpenseOccurrenceMutation = useMutation({
    mutationFn: ({ id, year, month, amount }: { id: number; year: number; month: number; amount: string | null }) =>
      confirmExpenseOccurrence(id, year, month, amount),
    onSuccess: () => {
      invalidateAll();
      showToast("Mês confirmado.", "success");
      setConfirmingOccurrence(null);
    },
    onError: (err) => showToast(extractErrorMessage(err, "Não foi possível confirmar este mês."), "error"),
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

  function confirmReject() {
    if (!rejecting) return;
    if (isFixedOccurrence(rejecting)) {
      const { occurrence_year, occurrence_month } = rejecting;
      if (rejecting.kind === "entry") {
        rejectEntryOccurrenceMutation.mutate({ id: rejecting.id, year: occurrence_year!, month: occurrence_month! });
      } else {
        rejectExpenseOccurrenceMutation.mutate({ id: rejecting.id, year: occurrence_year!, month: occurrence_month! });
      }
      return;
    }
    if (rejecting.kind === "entry") rejectEntryMutation.mutate(rejecting.id);
    else rejectExpenseMutation.mutate(rejecting.id);
  }

  function submitOccurrenceConfirm(amount: string | null) {
    if (!confirmingOccurrence) return;
    const { occurrence_year, occurrence_month } = confirmingOccurrence;
    if (confirmingOccurrence.kind === "entry") {
      confirmEntryOccurrenceMutation.mutate({
        id: confirmingOccurrence.id,
        year: occurrence_year!,
        month: occurrence_month!,
        amount,
      });
    } else {
      confirmExpenseOccurrenceMutation.mutate({
        id: confirmingOccurrence.id,
        year: occurrence_year!,
        month: occurrence_month!,
        amount,
      });
    }
  }

  const occurrenceConfirmMutationError =
    confirmingOccurrence?.kind === "expense" ? confirmExpenseOccurrenceMutation.error : confirmEntryOccurrenceMutation.error;
  const occurrenceConfirmError = occurrenceConfirmMutationError
    ? extractErrorMessage(occurrenceConfirmMutationError, "Não foi possível confirmar este mês.")
    : null;

  function openConfirm(item: PlanningItem) {
    if (isFixedOccurrence(item)) {
      setConfirmingOccurrence(item);
      return;
    }
    if (item.kind === "entry") setEditingEntry({ ...item.data, is_planned: false });
    else setEditingExpense({ ...item.data, is_planned: false });
  }

  const groups = useMemo(() => {
    if (!data) return [];
    const items: PlanningItem[] = [
      ...data.entries.map((item) => ({
        kind: "entry" as const,
        id: item.entry.id,
        data: item.entry,
        review_date: item.review_date,
        occurrence_year: item.occurrence_year,
        occurrence_month: item.occurrence_month,
      })),
      ...data.expenses.map((item) => ({
        kind: "expense" as const,
        id: item.expense.id,
        data: item.expense,
        review_date: item.review_date,
        occurrence_year: item.occurrence_year,
        occurrence_month: item.occurrence_month,
      })),
    ].sort((a, b) => a.review_date.localeCompare(b.review_date));

    const map = new Map<string, PlanningItem[]>();
    for (const item of items) {
      if (!map.has(item.review_date)) map.set(item.review_date, []);
      map.get(item.review_date)!.push(item);
    }
    return Array.from(map.entries());
  }, [data]);

  const totalPending = groups.reduce((sum, [, items]) => sum + items.length, 0);

  // Default window for the three comparison charts - each one then scrolls on its
  // own from here (see useChartWindow).
  const comparisonSource: ChartWindowSource<PlannedComparison> | null = useMemo(() => {
    const comparison = comparisonQuery.data;
    if (!comparison || comparison.points.length === 0) return null;
    const first = comparison.points[0];
    return {
      defaultData: comparison,
      range: comparison.navigable_range,
      defaultStart: toMonthIndex(first.year, first.month),
      size: comparison.points.length,
    };
  }, [comparisonQuery.data]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Planejamentos</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Entradas e saídas estimadas aguardando confirmação, e o impacto delas no saldo.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          Aguardando revisão {totalPending > 0 && `(${totalPending})`}
        </h2>

        {isLoading && <Spinner label="Carregando planejamentos..." />}
        {isError && <ErrorState message="Não foi possível carregar os planejamentos." onRetry={() => refetch()} />}

        {!isLoading && !isError && groups.length === 0 && (
          <EmptyState
            title="Nada pendente"
            description="Não há entradas ou saídas planejadas aguardando confirmação no momento."
          />
        )}

        {groups.length > 0 && (
          <div className="flex flex-col gap-4">
            {groups.map(([dateStr, items]) => {
              const { title, tag } = dateGroupLabel(dateStr, items);
              return (
                <div key={dateStr}>
                  <div className="mb-1.5 flex items-center gap-2 px-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                      {title}
                    </p>
                    {tag && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          tag === "Atrasado"
                            ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                        }`}
                      >
                        {tag}
                      </span>
                    )}
                  </div>
                  <ul className="flex flex-col divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-300 dark:divide-neutral-800 dark:border-neutral-800">
                    {items.map((item) => (
                      <li
                        key={`${item.kind}-${item.id}-${item.occurrence_year ?? "x"}-${item.occurrence_month ?? "x"}`}
                        onClick={() =>
                          item.kind === "entry" ? setInspectingEntry(item.data) : setInspectingExpense(item.data)
                        }
                        className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                      >
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                            item.kind === "entry"
                              ? "bg-cartuga-50 text-cartuga-600 dark:bg-cartuga-900/30 dark:text-cartuga-400"
                              : "bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-400"
                          }`}
                        >
                          {item.kind === "entry" ? (
                            <ArrowUpIcon className="h-4 w-4" />
                          ) : (
                            <ArrowDownIcon className="h-4 w-4" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5">
                            <span className="min-w-0 truncate font-medium text-neutral-800 dark:text-neutral-100">
                              {item.data.description}
                            </span>
                            <span className="shrink-0">
                              <TypeBadge type={item.data.type} />
                            </span>
                            {isFixedOccurrence(item) && (
                              <span
                                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                                title="Ocorrência mensal de uma entrada/saída fixa"
                              >
                                <ClockIcon className="h-3 w-3" />
                                Mensal
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
                            {item.data.source}
                          </p>
                        </div>
                        <CurrencyAmount
                          amount={item.data.amount}
                          className={`shrink-0 font-semibold ${
                            item.kind === "entry"
                              ? "text-cartuga-700 dark:text-cartuga-300"
                              : "text-red-600 dark:text-red-400"
                          }`}
                        />
                        <div className="flex shrink-0 gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="secondary"
                            className="!px-2.5 !py-1.5 text-xs"
                            onClick={() => setRejecting(item)}
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                            Recusar
                          </Button>
                          <Button className="!px-2.5 !py-1.5 text-xs" onClick={() => openConfirm(item)}>
                            <CheckIcon className="h-3.5 w-3.5" />
                            Confirmar
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4 border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <div>
          <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
            Impacto dos planejados no saldo
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {comparisonQuery.data && !comparisonQuery.data.has_planned
              ? "Nenhum registro planejado no momento: as duas linhas coincidem porque não há nada a ignorar ainda."
              : "Saldo acumulado considerando (linha sólida) ou ignorando (linha tracejada) tudo que está planejado."}
          </p>
        </div>

        {comparisonQuery.isLoading && <Spinner label="Calculando..." />}
        {comparisonQuery.isError && (
          <ErrorState message="Não foi possível carregar o impacto dos planejados." onRetry={() => comparisonQuery.refetch()} />
        )}

        {comparisonSource && (
          <>
            <div className="rounded-xl border border-neutral-300 bg-[var(--color-surface)] p-4 dark:border-neutral-800">
              <PlannedBalanceChart source={comparisonSource} />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-neutral-300 bg-[var(--color-surface)] p-4 dark:border-neutral-800">
                <PlannedMonthlyChart source={comparisonSource} kind="entries" />
              </div>
              <div className="rounded-xl border border-neutral-300 bg-[var(--color-surface)] p-4 dark:border-neutral-800">
                <PlannedMonthlyChart source={comparisonSource} kind="expenses" />
              </div>
            </div>
          </>
        )}
      </section>

      <EntryDetailModal
        entry={inspectingEntry}
        onClose={() => setInspectingEntry(null)}
        onEdit={(entry) => {
          setInspectingEntry(null);
          setEditingEntry(entry);
        }}
        onDelete={(entry) => {
          setInspectingEntry(null);
          // Excluir here always means "delete the whole record", same as everywhere
          // else in the app - never routed through the occurrence-reject endpoint,
          // even for a FIXED entry (occurrence_year/month null forces that branch).
          setRejecting({ kind: "entry", id: entry.id, data: entry, review_date: entry.date, occurrence_year: null, occurrence_month: null });
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

      <ExpenseDetailModal
        expense={inspectingExpense}
        onClose={() => setInspectingExpense(null)}
        onEdit={(expense) => {
          setInspectingExpense(null);
          setEditingExpense(expense);
        }}
        onDelete={(expense) => {
          setInspectingExpense(null);
          // See EntryDetailModal's onDelete above - always a full delete.
          setRejecting({
            kind: "expense",
            id: expense.id,
            data: expense,
            review_date: expense.date,
            occurrence_year: null,
            occurrence_month: null,
          });
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

      <ConfirmDialog
        open={rejecting !== null}
        title={rejecting && isFixedOccurrence(rejecting) ? "Recusar este mês?" : "Recusar planejamento?"}
        message={
          rejecting && isFixedOccurrence(rejecting)
            ? `Apenas ${monthFull(rejecting.occurrence_month!).toLowerCase()} de ${rejecting.occurrence_year} deixa de contar no saldo. A entrada/saída fixa continua normalmente nos outros meses. Esta ação não poderá ser desfeita.`
            : "A entrada/saída será excluída definitivamente, como se nunca tivesse acontecido, e os cálculos são refeitos sem ela. Esta ação não poderá ser desfeita."
        }
        confirmLabel="Recusar"
        loading={
          rejectEntryMutation.isPending ||
          rejectExpenseMutation.isPending ||
          rejectEntryOccurrenceMutation.isPending ||
          rejectExpenseOccurrenceMutation.isPending
        }
        onCancel={() => setRejecting(null)}
        onConfirm={confirmReject}
      />

      {confirmingOccurrence && (
        <OccurrenceConfirmModal
          open={confirmingOccurrence !== null}
          onClose={() => setConfirmingOccurrence(null)}
          onSubmit={submitOccurrenceConfirm}
          loading={confirmEntryOccurrenceMutation.isPending || confirmExpenseOccurrenceMutation.isPending}
          error={occurrenceConfirmError}
          baseAmount={confirmingOccurrence.data.amount}
          year={confirmingOccurrence.occurrence_year!}
          month={confirmingOccurrence.occurrence_month!}
          description={confirmingOccurrence.data.description}
        />
      )}
    </div>
  );
}
