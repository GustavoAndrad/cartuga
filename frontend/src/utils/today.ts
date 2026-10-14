/** Today's date as YYYY-MM-DD, in the browser's local timezone - the same format
 * every date input/field in the app already stores and compares against. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
