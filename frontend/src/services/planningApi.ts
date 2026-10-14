import { apiClient } from "./api";
import type { PendingReview, PlannedComparison } from "../types";

export async function getPendingReview(): Promise<PendingReview> {
  const { data } = await apiClient.get<PendingReview>("/planning/pending");
  return data;
}

export async function getPlannedComparison(
  historyMonths = 6,
  projectionMonths = 12
): Promise<PlannedComparison> {
  const { data } = await apiClient.get<PlannedComparison>("/planning/comparison", {
    params: { history_months: historyMonths, projection_months: projectionMonths },
  });
  return data;
}

/** Same comparison for an explicit window - a Planejamentos chart scrolled away from
 * its default window. */
export async function getPlannedComparisonWindow(
  from: { year: number; month: number },
  months: number
): Promise<PlannedComparison> {
  const { data } = await apiClient.get<PlannedComparison>("/planning/comparison", {
    params: { from_year: from.year, from_month: from.month, months },
  });
  return data;
}
