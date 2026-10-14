import type { ReactNode } from "react";

import type { MonthWindow } from "../hooks/useMonthWindow";
import { ChevronLeftIcon, ChevronRightIcon, InfoCircleIcon, ResetViewIcon } from "./table/icons";

interface ChartWindowHeaderProps {
  title: ReactNode;
  hint?: string;
  nav: MonthWindow;
  /** The new window's data is still loading - the chart keeps showing the previous one. */
  isLoading?: boolean;
  /** The new window's data failed to load. */
  isError?: boolean;
}

const arrowClass = (enabled: boolean) =>
  `flex h-8 w-8 items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cartuga-500 ${
    enabled
      ? "text-neutral-600 hover:bg-cartuga-50 hover:text-cartuga-700 dark:text-neutral-300 dark:hover:bg-cartuga-900/30 dark:hover:text-cartuga-300"
      : "cursor-not-allowed text-neutral-300 dark:text-neutral-600"
  }`;

/**
 * Title row of a month-by-month chart, with ‹ › arrows that scroll that chart (and
 * only that chart) one month at a time. An arrow at the edge of the navigable range
 * stays clickable on purpose: clicking it explains why the chart can't go further,
 * instead of silently doing nothing.
 */
export function ChartWindowHeader({ title, hint, nav, isLoading = false, isError = false }: ChartWindowHeaderProps) {
  return (
    <div className="mb-2 flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          {title}
          {hint && <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">{hint}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 self-start">
          {!nav.isDefault && (
            <button
              type="button"
              onClick={nav.reset}
              aria-label="Voltar ao período padrão"
              title="Voltar ao período padrão"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-cartuga-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-cartuga-300"
            >
              <ResetViewIcon className="h-4 w-4" />
            </button>
          )}
          <div className="flex items-center overflow-hidden rounded-lg border border-neutral-300 dark:border-neutral-700">
            <button
              type="button"
              onClick={nav.prev}
              aria-disabled={!nav.canPrev}
              aria-label="Mostrar um mês antes"
              title="Mês anterior"
              className={arrowClass(nav.canPrev)}
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <span
              className={`min-w-[7.5rem] border-x border-neutral-300 px-2 text-center text-xs font-medium tabular-nums text-neutral-700 dark:border-neutral-700 dark:text-neutral-200 ${
                isLoading ? "animate-pulse" : ""
              }`}
            >
              {nav.rangeLabel}
            </span>
            <button
              type="button"
              onClick={nav.next}
              aria-disabled={!nav.canNext}
              aria-label="Mostrar um mês depois"
              title="Próximo mês"
              className={arrowClass(nav.canNext)}
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div aria-live="polite" className="flex flex-col gap-2">
        {isError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            <InfoCircleIcon className="mt-px h-4 w-4 shrink-0" />
            <span>Não foi possível carregar esse período. Os dados exibidos são do período anterior.</span>
          </div>
        )}
        {nav.notice && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
            <InfoCircleIcon className="mt-px h-4 w-4 shrink-0" />
            <span>{nav.notice}</span>
          </div>
        )}
      </div>
    </div>
  );
}
