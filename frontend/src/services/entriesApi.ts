import { apiClient } from "./api";
import type { Entry, EntryInput, Impact, OccurrenceReview } from "../types";

export async function listEntries(): Promise<Entry[]> {
  const { data } = await apiClient.get<Entry[]>("/entries");
  return data;
}

export async function createEntry(payload: EntryInput): Promise<Entry> {
  const { data } = await apiClient.post<Entry>("/entries", payload);
  return data;
}

export async function updateEntry(id: number, payload: EntryInput): Promise<Entry> {
  const { data } = await apiClient.put<Entry>(`/entries/${id}`, payload);
  return data;
}

export async function deleteEntry(id: number): Promise<void> {
  await apiClient.delete(`/entries/${id}`);
}

export async function getEntryImpact(id: number): Promise<Impact> {
  const { data } = await apiClient.get<Impact>(`/entries/${id}/impact`);
  return data;
}

export async function confirmEntryOccurrence(
  id: number,
  year: number,
  month: number,
  amount: string | null
): Promise<OccurrenceReview> {
  const { data } = await apiClient.post<OccurrenceReview>(`/entries/${id}/occurrences/${year}/${month}/confirm`, {
    amount,
  });
  return data;
}

export async function rejectEntryOccurrence(id: number, year: number, month: number): Promise<OccurrenceReview> {
  const { data } = await apiClient.post<OccurrenceReview>(`/entries/${id}/occurrences/${year}/${month}/reject`);
  return data;
}
