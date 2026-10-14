import { apiClient } from "./api";
import type { ImportConfirmResult, ImportPreview } from "../types";

export async function exportDatabase(): Promise<void> {
  const response = await apiClient.get("/database/export", { responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.download = "cartuga-export.xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function validateImport(file: File): Promise<ImportPreview> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await apiClient.post<ImportPreview>("/database/import", formData, {
    params: { dry_run: true },
  });
  return data;
}

export async function confirmImport(file: File): Promise<ImportConfirmResult> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await apiClient.post<ImportConfirmResult>("/database/import", formData, {
    params: { confirm: true },
  });
  return data;
}

export async function restoreBackup(): Promise<{ restored_from: string }> {
  const { data } = await apiClient.post("/database/restore-backup");
  return data;
}
