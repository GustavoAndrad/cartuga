import { apiClient } from "./api";
import type { BankImportCommitResult, BankImportPreview, BankImportRow, BankName } from "../types";

export async function previewBankImport(file: File, bank: BankName): Promise<BankImportPreview> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("bank", bank);
  const { data } = await apiClient.post<BankImportPreview>("/bank-import/preview", formData);
  return data;
}

export async function commitBankImport(rows: BankImportRow[]): Promise<BankImportCommitResult> {
  const { data } = await apiClient.post<BankImportCommitResult>("/bank-import/commit", { rows });
  return data;
}
