import type { RecurrenceType } from "../types";

interface DateRangeLike {
  type: RecurrenceType;
  date: string;
  start_date: string | null;
  end_date: string | null;
}

export function formatDateRange(item: DateRangeLike): string {
  if (item.type === "EXCEPTIONAL") {
    return new Date(item.date + "T00:00:00").toLocaleDateString("pt-BR");
  }
  const start = item.start_date ? new Date(item.start_date + "T00:00:00").toLocaleDateString("pt-BR") : "?";
  const end = item.end_date ? new Date(item.end_date + "T00:00:00").toLocaleDateString("pt-BR") : "indefinido";
  return `${start} → ${end}`;
}
