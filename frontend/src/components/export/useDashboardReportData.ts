import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { fromMonthIndex } from "../../charts/monthWindow";
import { getDashboard, getDashboardSeries, getMonthDetail } from "../../services/dashboardApi";
import type { DashboardData, MonthDetail, MonthPoint } from "../../types";
import {
  currentMonthIndex,
  DASHBOARD_HISTORY_MONTHS,
  defaultWindowStart,
  windowSize,
  type DashboardExportConfig,
  type ReportChart,
} from "./reportModel";

/** One chart window that isn't the dashboard's default - same key as useChartWindow. */
function useSeriesWindow(start: number, size: number, enabled: boolean) {
  return useQuery({
    queryKey: ["dashboard", "series", start, size],
    queryFn: () => getDashboardSeries(fromMonthIndex(start), size),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export interface DashboardReportData {
  dashboard: DashboardData;
  series: Record<ReportChart, MonthPoint[]>;
  monthDetail: MonthDetail | undefined;
}

/**
 * Everything the report needs for a given config. Uses the very same query keys as
 * the dashboard (["dashboard", projection], ["dashboard", "series", start, size],
 * ["dashboard", "month", y, m]), so whatever the dashboard already shows comes
 * straight from cache and the report can never disagree with it.
 */
export function useDashboardReportData(config: DashboardExportConfig, enabled: boolean) {
  const size = windowSize(config.projectionMonths);
  const defaultStart = defaultWindowStart();

  const dashboardQuery = useQuery({
    queryKey: ["dashboard", config.projectionMonths],
    queryFn: () => getDashboard(DASHBOARD_HISTORY_MONTHS, config.projectionMonths),
    enabled,
    placeholderData: keepPreviousData,
  });

  const windows = {
    timeSeries: useSeriesWindow(config.windows.timeSeries, size, enabled && config.windows.timeSeries !== defaultStart),
    balance: useSeriesWindow(config.windows.balance, size, enabled && config.windows.balance !== defaultStart),
    cumulative: useSeriesWindow(config.windows.cumulative, size, enabled && config.windows.cumulative !== defaultStart),
  };

  const { year, month } = fromMonthIndex(currentMonthIndex());
  const monthQuery = useQuery({
    queryKey: ["dashboard", "month", year, month],
    queryFn: () => getMonthDetail(year, month),
    enabled: enabled && config.sections.monthItems,
  });

  const dashboard = dashboardQuery.data;
  const pointsFor = (chart: ReportChart): MonthPoint[] | undefined =>
    config.windows[chart] === defaultStart ? dashboard?.time_series : windows[chart].data;

  const series = {
    timeSeries: pointsFor("timeSeries"),
    balance: pointsFor("balance"),
    cumulative: pointsFor("cumulative"),
  };
  const queries = [dashboardQuery, monthQuery, ...Object.values(windows)];

  const ready =
    !!dashboard &&
    Object.values(series).every((s) => !!s) &&
    (!config.sections.monthItems || !!monthQuery.data);

  return {
    data: ready
      ? ({ dashboard, series, monthDetail: monthQuery.data } as DashboardReportData)
      : undefined,
    isFetching: queries.some((q) => q.isFetching),
    isError: queries.some((q) => q.isError),
  };
}
