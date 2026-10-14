import type { RecurrenceType } from "../types";

interface MonthLike {
  type: RecurrenceType;
  date: string;
  start_date: string | null;
  end_date: string | null;
}

function yearMonth(isoDate: string): [number, number] {
  const [y, m] = isoDate.split("-").map(Number);
  return [y, m];
}

function isBeforeOrEqual([ay, am]: [number, number], [by, bm]: [number, number]): boolean {
  return ay < by || (ay === by && am <= bm);
}

/** Matches by (year, month) only, same convention as the backend's finance engine:
 * an exceptional item matches its exact month; a fixed item matches any month
 * within [start, end ?? indefinitely]. */
export function matchesMonth(item: MonthLike, monthFilter: string): boolean {
  if (!monthFilter) return true;
  const target = yearMonth(`${monthFilter}-01`);

  if (item.type === "EXCEPTIONAL") {
    return isBeforeOrEqual(target, yearMonth(item.date)) && isBeforeOrEqual(yearMonth(item.date), target);
  }

  const start = yearMonth(item.start_date ?? item.date);
  if (!isBeforeOrEqual(start, target)) return false;
  if (!item.end_date) return true;
  return isBeforeOrEqual(target, yearMonth(item.end_date));
}
