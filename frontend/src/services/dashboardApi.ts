import { apiClient } from "./api";
import type { DashboardData, MonthDetail, MonthPoint } from "../types";

export async function getDashboard(historyMonths = 6, projectionMonths = 6): Promise<DashboardData> {
  const { data } = await apiClient.get<DashboardData>("/dashboard", {
    params: { history_months: historyMonths, projection_months: projectionMonths },
  });
  return data;
}

/** `months` consecutive points starting at `from` - a chart scrolled away from the
 * default window GET /dashboard already returns. */
export async function getDashboardSeries(
  from: { year: number; month: number },
  months: number
): Promise<MonthPoint[]> {
  const { data } = await apiClient.get<MonthPoint[]>("/dashboard/series", {
    params: { from_year: from.year, from_month: from.month, months },
  });
  return data;
}

export async function getMonthDetail(year: number, month: number): Promise<MonthDetail> {
  const { data } = await apiClient.get<MonthDetail>(`/dashboard/month/${year}/${month}`);
  return data;
}
