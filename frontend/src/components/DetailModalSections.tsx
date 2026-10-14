import type { ReactNode } from "react";

/** A light, borderless row of small label/value facts (Fonte, Tipo, Moeda, Período) -
 * deliberately lower visual weight than DetailCard below, since these are simple,
 * self-evident metadata, not content that needs its own card. */
export function QuickFacts({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-3 rounded-xl bg-neutral-50 px-4 py-3 dark:bg-neutral-800/60">
      {children}
    </div>
  );
}

export function QuickFact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-[76px]">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
        {label}
      </p>
      <div className="mt-0.5 text-sm font-medium text-neutral-800 dark:text-neutral-100">{value}</div>
    </div>
  );
}

/** A titled card for content that's richer than a single fact (parcelas, conversão) -
 * heavier than QuickFacts on purpose, to visually separate "at a glance" info from
 * "worth its own section" info. */
export function DetailCard({
  icon,
  title,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {icon}
          {title}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function MiniStat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
        {label}
      </p>
      <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">{value}</p>
      {sub && <p className="text-xs text-neutral-400 dark:text-neutral-500">{sub}</p>}
    </div>
  );
}
