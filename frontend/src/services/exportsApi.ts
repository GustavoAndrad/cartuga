import { apiClient } from "./api";
import type { NavigableRange } from "../types";

export type DataExportFormat = "excel_br" | "standard";

export interface DataExportRequest {
  from_year: number;
  from_month: number;
  to_year: number;
  to_month: number;
  datasets: string[];
  format: DataExportFormat;
}

export interface DatasetInfo {
  key: string;
  label: string;
  description: string;
  filename: string;
  columns: string[];
}

export interface DataExportOptions {
  datasets: DatasetInfo[];
  navigable_range: NavigableRange;
  max_span_months: number;
}

export interface DatasetPreview {
  key: string;
  label: string;
  filename: string;
  columns: string[];
  rows: string[][];
  total_rows: number;
}

export async function getDataExportOptions(): Promise<DataExportOptions> {
  const { data } = await apiClient.get<DataExportOptions>("/exports/data/options");
  return data;
}

export async function previewDataExport(request: DataExportRequest): Promise<DatasetPreview[]> {
  const { data } = await apiClient.post<{ datasets: DatasetPreview[] }>("/exports/data/preview", request);
  return data.datasets;
}

/** Downloads the CSV (one dataset) or zip (several) - the server picks the filename. */
export async function downloadDataExport(request: DataExportRequest): Promise<string> {
  const response = await apiClient.post("/exports/data", request, { responseType: "blob" });
  const disposition = String(response.headers["content-disposition"] ?? "");
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "cartuga_dados.zip";
  const url = window.URL.createObjectURL(response.data as Blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
  return filename;
}
