import { ClockIcon } from "./icons";

/** Marks a speculative/estimated entry or expense not yet confirmed - see
 * docs/decisions.md "Planejado". Blue on purpose: TypeBadge already uses amber for
 * "Excepcional", and this needs to read as a distinct, unrelated status. */
export function PlannedBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 ${className}`}
    >
      <ClockIcon className="h-3 w-3 shrink-0" />
      Planejado
    </span>
  );
}
