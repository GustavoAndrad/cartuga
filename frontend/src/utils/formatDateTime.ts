/** Formats an ISO datetime string (`created_at`/`updated_at`, always server UTC) as a
 * localized date + time for display, e.g. "28/08/2026 às 14:32". */
export function formatDateTime(isoDateTime: string): string {
  const date = new Date(isoDateTime.endsWith("Z") ? isoDateTime : `${isoDateTime}Z`);
  const datePart = date.toLocaleDateString("pt-BR");
  const timePart = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${datePart} às ${timePart}`;
}
