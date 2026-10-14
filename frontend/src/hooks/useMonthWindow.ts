import { useCallback, useEffect, useState } from "react";

import { labelOf, type BlockedMessages, type WindowBounds } from "../charts/monthWindow";

const NOTICE_DURATION_MS = 4000;

export interface MonthWindow {
  /** First month shown (see toMonthIndex). */
  start: number;
  /** Last month shown - always start + size - 1: scrolling never changes the size. */
  end: number;
  size: number;
  isDefault: boolean;
  canPrev: boolean;
  canNext: boolean;
  rangeLabel: string;
  /** Why the last arrow click did nothing - cleared automatically after a few seconds. */
  notice: string | null;
  prev: () => void;
  next: () => void;
  reset: () => void;
}

/**
 * A fixed-size window of months a single chart can scroll through, one month per
 * click, within `bounds` (null while those are still loading). Each chart owns its
 * own instance, so scrolling one never moves another. Changing `defaultStart` or
 * `size` (e.g. a new projection length) snaps the window back to its default.
 */
export function useMonthWindow(
  defaultStart: number,
  size: number,
  bounds: WindowBounds | null,
  messages: BlockedMessages | null
): MonthWindow {
  const [start, setStart] = useState(defaultStart);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setStart(defaultStart);
    setNotice(null);
  }, [defaultStart, size]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const end = start + size - 1;
  const canPrev = bounds !== null && start > bounds.first;
  const canNext = bounds !== null && end < bounds.last;

  const prev = useCallback(() => {
    if (!canPrev) {
      if (messages) setNotice(messages.prev);
      return;
    }
    setNotice(null);
    setStart((s) => s - 1);
  }, [canPrev, messages]);

  const next = useCallback(() => {
    if (!canNext) {
      if (messages) setNotice(messages.next);
      return;
    }
    setNotice(null);
    setStart((s) => s + 1);
  }, [canNext, messages]);

  const reset = useCallback(() => {
    setNotice(null);
    setStart(defaultStart);
  }, [defaultStart]);

  return {
    start,
    end,
    size,
    isDefault: start === defaultStart,
    canPrev,
    canNext,
    rangeLabel: `${labelOf(start)} a ${labelOf(end)}`,
    notice,
    prev,
    next,
    reset,
  };
}
