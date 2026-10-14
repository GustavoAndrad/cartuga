import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-12 text-center dark:border-neutral-700 dark:bg-neutral-900/40">
      <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{title}</p>
      {description && <p className="text-sm text-neutral-500 dark:text-neutral-400">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
