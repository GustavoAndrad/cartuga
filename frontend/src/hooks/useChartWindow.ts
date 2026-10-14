import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import {
  balanceBlockedMessages,
  boundsFromRange,
  fromMonthIndex,
  type MonthRef,
} from "../charts/monthWindow";
import type { NavigableRange } from "../types";
import { useMonthWindow, type MonthWindow } from "./useMonthWindow";

/** What a page already loaded for a chart's default window. */
export interface ChartWindowSource<T> {
  defaultData: T;
  range: NavigableRange;
  /** First month of the default window (see toMonthIndex). */
  defaultStart: number;
  size: number;
}

interface UseChartWindowOptions<T> extends ChartWindowSource<T> {
  /** Prefix for this chart's window queries - start/size are appended. Keep it under
   * the page's own key (e.g. ["dashboard", ...]) so the page's invalidations also
   * refresh scrolled windows. */
  queryKey: readonly unknown[];
  fetchWindow: (from: MonthRef, months: number) => Promise<T>;
}

export interface ChartWindowState<T> {
  nav: MonthWindow;
  data: T;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Scrollable month window for one balance chart (dashboard, Planejamentos). The
 * default window reuses the data the page already has; any other window is fetched
 * on its own, keeping the previous window on screen until it arrives.
 */
export function useChartWindow<T>({
  queryKey,
  fetchWindow,
  defaultData,
  range,
  defaultStart,
  size,
}: UseChartWindowOptions<T>): ChartWindowState<T> {
  const bounds = useMemo(() => boundsFromRange(range), [range]);
  const messages = useMemo(() => balanceBlockedMessages(range), [range]);
  const nav = useMonthWindow(defaultStart, size, bounds, messages);

  // Rapid clicks only fetch the window the user stops on, not every one in between -
  // each window is a full balance recalculation on the server.
  const fetchStart = useDebouncedValue(nav.start, FETCH_DEBOUNCE_MS);

  const query = useQuery({
    queryKey: [...queryKey, fetchStart, nav.size],
    queryFn: () => fetchWindow(fromMonthIndex(fetchStart), nav.size),
    enabled: fetchStart !== defaultStart,
    placeholderData: keepPreviousData,
  });

  return {
    nav,
    data: nav.isDefault ? defaultData : (query.data ?? defaultData),
    isLoading: !nav.isDefault && (fetchStart !== nav.start || query.isFetching),
    isError: !nav.isDefault && query.isError,
  };
}

const FETCH_DEBOUNCE_MS = 250;

function useDebouncedValue<V>(value: V, delayMs: number): V {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
