import { monthLabel } from "./monthLabels";
import type { NavigableRange } from "../types";

export interface MonthRef {
  year: number;
  month: number;
}

/** Months as a single integer, so windows can be shifted/compared with plain math. */
export function toMonthIndex(year: number, month: number): number {
  return year * 12 + (month - 1);
}

export function fromMonthIndex(index: number): MonthRef {
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function labelOf(index: number): string {
  const { year, month } = fromMonthIndex(index);
  return monthLabel(year, month);
}

export interface WindowBounds {
  first: number;
  last: number;
}

export interface BlockedMessages {
  prev: string;
  next: string;
}

export function boundsFromRange(range: NavigableRange): WindowBounds {
  return {
    first: toMonthIndex(range.first_year, range.first_month),
    last: toMonthIndex(range.last_year, range.last_month),
  };
}

/** What to tell the user when a balance chart (dashboard, Planejamentos) can't be
 * scrolled any further. */
export function balanceBlockedMessages(range: NavigableRange): BlockedMessages {
  const { first, last } = boundsFromRange(range);
  return {
    prev: `Não há registros antes de ${labelOf(first)}: este é o primeiro mês com dados.`,
    next:
      range.last_reason === "HORIZON"
        ? `A projeção vai só até ${labelOf(last)}, o limite de 60 meses à frente.`
        : `Não há lançamentos depois de ${labelOf(last)}: a partir daí o saldo não muda mais.`,
  };
}
