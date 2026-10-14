import { apiClient } from "./api";
import type { CarveableEntry, VaultSummary, VaultTransaction, VaultTransactionInput } from "../types";

export async function getVaultSummary(): Promise<VaultSummary> {
  const { data } = await apiClient.get<VaultSummary>("/vault/summary");
  return data;
}

export async function listVaultTransactions(): Promise<VaultTransaction[]> {
  const { data } = await apiClient.get<VaultTransaction[]>("/vault/transactions");
  return data;
}

export async function createVaultTransaction(payload: VaultTransactionInput): Promise<VaultTransaction> {
  const { data } = await apiClient.post<VaultTransaction>("/vault/transactions", payload);
  return data;
}

export async function deleteVaultTransaction(id: number): Promise<void> {
  await apiClient.delete(`/vault/transactions/${id}`);
}

export async function listCarveableEntries(): Promise<CarveableEntry[]> {
  const { data } = await apiClient.get<CarveableEntry[]>("/vault/carveable-entries");
  return data;
}
