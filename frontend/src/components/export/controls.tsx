import type { ReactNode } from "react";

import { labelOf } from "../../charts/monthWindow";
import { ChevronLeftIcon, ChevronRightIcon, ResetViewIcon } from "../table/icons";

export function ConfigSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2 border-t border-neutral-200 pt-4 first:border-t-0 first:pt-0 dark:border-neutral-800">
      <legend className="contents">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {title}
        </span>
      </legend>
      {hint && <p className="text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>}
      {children}
    </fieldset>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}

export function Segmented<T extends string>({ value, options, onChange, label }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex self-start overflow-hidden rounded-lg border border-neutral-300 text-xs dark:border-neutral-700">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-2.5 py-1.5 font-medium transition-colors ${
            value === opt.value
              ? "bg-cartuga-600 text-white"
              : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function CheckRow({
  checked,
  onChange,
  label,
  description,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-cartuga-600"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-neutral-800 dark:text-neutral-100">{label}</span>
          {description && <span className="block text-xs text-neutral-500 dark:text-neutral-400">{description}</span>}
        </span>
      </label>
      {checked && children && <div className="pl-6">{children}</div>}
    </div>
  );
}

const stepButton =
  "flex h-7 w-7 items-center justify-center text-neutral-600 transition-colors hover:bg-cartuga-50 hover:text-cartuga-700 disabled:cursor-not-allowed disabled:text-neutral-300 disabled:hover:bg-transparent dark:text-neutral-300 dark:hover:bg-cartuga-900/30 dark:disabled:text-neutral-600";

/** Moves a fixed-size month window one month at a time, within [min, max] starts. */
export function MonthWindowStepper({
  start,
  size,
  min,
  max,
  defaultStart,
  onChange,
}: {
  start: number;
  size: number;
  min: number;
  max: number;
  defaultStart: number;
  onChange: (start: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center overflow-hidden rounded-lg border border-neutral-300 dark:border-neutral-700">
        <button
          type="button"
          onClick={() => onChange(start - 1)}
          disabled={start <= min}
          aria-label="Um mês antes"
          title={start <= min ? `Não há registros antes de ${labelOf(min)}` : "Um mês antes"}
          className={stepButton}
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-[7rem] border-x border-neutral-300 px-2 text-center text-xs font-medium tabular-nums text-neutral-700 dark:border-neutral-700 dark:text-neutral-200">
          {labelOf(start)} a {labelOf(start + size - 1)}
        </span>
        <button
          type="button"
          onClick={() => onChange(start + 1)}
          disabled={start >= max}
          aria-label="Um mês depois"
          title={start >= max ? `O limite é ${labelOf(max + size - 1)}` : "Um mês depois"}
          className={stepButton}
        >
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      {start !== defaultStart && (
        <button
          type="button"
          onClick={() => onChange(defaultStart)}
          className="flex items-center gap-1 text-xs text-neutral-500 hover:text-cartuga-700 dark:text-neutral-400 dark:hover:text-cartuga-300"
        >
          <ResetViewIcon className="h-3.5 w-3.5" />
          Padrão
        </button>
      )}
    </div>
  );
}
