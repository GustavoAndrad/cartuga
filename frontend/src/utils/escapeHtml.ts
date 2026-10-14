/** Escapes text for safe interpolation into an HTML string (Highcharts tooltip
 * formatters with useHTML:true build markup via string concatenation, not the DOM,
 * so anything user-controlled - entry/expense "source" labels, in particular - must
 * be escaped by hand before it goes in. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
