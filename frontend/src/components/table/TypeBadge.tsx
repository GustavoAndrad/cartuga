import type { RecurrenceType } from "../../types";

export function TypeBadge({ type }: { type: RecurrenceType }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        type === "FIXED"
          ? "bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200"
          : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
      }`}
    >
      {type === "FIXED" ? "Fixa" : "Excepcional"}
    </span>
  );
}
