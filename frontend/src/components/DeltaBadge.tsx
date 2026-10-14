import { ArrowDownIcon, ArrowUpIcon } from "./table/icons";

interface DeltaBadgeProps {
  current: number;
  previous: number;
  label: string;
}

const upClass = "bg-cartuga-50 text-cartuga-700 dark:bg-cartuga-900/30 dark:text-cartuga-400";
const downClass = "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400";
const neutralClass = "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400";

function Pill({ className, children, title }: { className: string; children: React.ReactNode; title: string }) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${className}`}
    >
      {children}
    </span>
  );
}

export function DeltaBadge({ current, previous, label }: DeltaBadgeProps) {
  const delta = current - previous;
  const title = `Comparado ${label}`;

  if (delta === 0) {
    return (
      <Pill className={neutralClass} title={title}>
        sem variação
      </Pill>
    );
  }

  const isUp = delta > 0;
  const pillClass = isUp ? upClass : downClass;
  const arrow = isUp ? <ArrowUpIcon className="h-2.5 w-2.5" /> : <ArrowDownIcon className="h-2.5 w-2.5" />;

  if (previous === 0) {
    // No baseline to compute a percentage against - show direction only.
    return (
      <Pill className={pillClass} title={title}>
        {arrow}
        novo
      </Pill>
    );
  }

  const pct = (delta / Math.abs(previous)) * 100;

  return (
    <Pill className={pillClass} title={title}>
      {arrow}
      {Math.abs(pct).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
    </Pill>
  );
}
