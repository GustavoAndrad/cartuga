import { apiClient } from "./api";
import type { Installment, InstallmentAdjustment } from "../types";

export async function getInstallment(id: number): Promise<Installment> {
  const { data } = await apiClient.get<Installment>(`/installments/${id}`);
  return data;
}

export async function addAdjustment(
  installmentId: number,
  payload: { amount: string; description: string }
): Promise<InstallmentAdjustment> {
  const { data } = await apiClient.post<InstallmentAdjustment>(
    `/installments/${installmentId}/adjustments`,
    payload
  );
  return data;
}

export async function deleteAdjustment(installmentId: number, adjustmentId: number): Promise<void> {
  await apiClient.delete(`/installments/${installmentId}/adjustments/${adjustmentId}`);
}

export async function advanceInstallment(id: number): Promise<Installment> {
  const { data } = await apiClient.post<Installment>(`/installments/${id}/advance`);
  return data;
}

export async function unadvanceInstallment(id: number): Promise<Installment> {
  const { data } = await apiClient.post<Installment>(`/installments/${id}/unadvance`);
  return data;
}
