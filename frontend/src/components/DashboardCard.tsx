import type { ReactNode } from "react";

import { InfoTooltip } from "./InfoTooltip";

interface DashboardCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  info?: string;
  hero?: boolean;
  icon?: ReactNode;
  trend?: ReactNode;
}

export function DashboardCard({ label, value, hint, info, hero = false, icon, trend }: DashboardCardProps) {
  return (
    <div
      className={
        hero
          ? "rounded-xl border border-neutral-300 bg-cartuga-50 p-3 dark:border-neutral-800 dark:bg-cartuga-900/30"
          : "rounded-xl border border-neutral-300 bg-[var(--color-surface)] p-3 dark:border-neutral-800"
      }
    >
      <div className="flex items-start gap-1.5">
        {/* Wraps instead of truncating: on phones two cards share a row. */}
        <p className="text-xs font-medium uppercase leading-snug tracking-wide text-neutral-500 dark:text-neutral-400">
          {label}
        </p>
        {info && <InfoTooltip text={info} />}
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="flex items-center gap-1.5 truncate text-xl font-semibold text-neutral-900 dark:text-neutral-50">
          {icon}
          {value}
        </span>
        {trend}
      </p>
      {hint && <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">{hint}</p>}
    </div>
  );
}
