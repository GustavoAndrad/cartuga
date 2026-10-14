import { apiClient } from "./api";
import type { Expense, ExpenseInput, Impact, Installment, OccurrenceReview } from "../types";

export async function listExpenses(): Promise<Expense[]> {
  const { data } = await apiClient.get<Expense[]>("/expenses");
  return data;
}

export async function createExpense(payload: ExpenseInput): Promise<Expense> {
  const { data } = await apiClient.post<Expense>("/expenses", payload);
  return data;
}

export async function updateExpense(id: number, payload: ExpenseInput): Promise<Expense> {
  const { data } = await apiClient.put<Expense>(`/expenses/${id}`, payload);
  return data;
}

export async function deleteExpense(id: number): Promise<void> {
  await apiClient.delete(`/expenses/${id}`);
}

export async function listExpenseInstallments(expenseId: number): Promise<Installment[]> {
  const { data } = await apiClient.get<Installment[]>(`/expenses/${expenseId}/installments`);
  return data;
}

export async function getExpenseImpact(id: number): Promise<Impact> {
  const { data } = await apiClient.get<Impact>(`/expenses/${id}/impact`);
  return data;
}

export async function confirmExpenseOccurrence(
  id: number,
  year: number,
  month: number,
  amount: string | null
): Promise<OccurrenceReview> {
  const { data } = await apiClient.post<OccurrenceReview>(`/expenses/${id}/occurrences/${year}/${month}/confirm`, {
    amount,
  });
  return data;
}

export async function rejectExpenseOccurrence(id: number, year: number, month: number): Promise<OccurrenceReview> {
  const { data } = await apiClient.post<OccurrenceReview>(`/expenses/${id}/occurrences/${year}/${month}/reject`);
  return data;
}
