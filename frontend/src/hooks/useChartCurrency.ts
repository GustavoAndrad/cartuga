import { useMemo } from "react";

import { makeDisplayFormatter } from "../utils/currencyFormat";
import { useCurrency } from "./useCurrency";

/** Conversion + formatting for charts: values are converted to the display currency
 * before plotting, then formatted as-is (see ChartContext in dashboardCharts). */
export function useChartCurrency() {
  const { convert, currency } = useCurrency();
  const format = useMemo(() => makeDisplayFormatter(currency), [currency]);
  return { convert, format };
}
