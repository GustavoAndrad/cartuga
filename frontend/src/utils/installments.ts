import type { Installment } from "../types";

export function isAdvanced(installment: Installment): boolean {
  return installment.advanced_to_year !== null && installment.advanced_to_month !== null;
}

/** Same "which month does this installment actually count toward" rule as the
 * backend's installment_effective_month_index: the advanced-to month if it's been
 * advanced, otherwise the month its due_date falls in. */
function effectiveMonthIndex(installment: Installment): number {
  if (isAdvanced(installment)) {
    return installment.advanced_to_year! * 12 + installment.advanced_to_month!;
  }
  const [year, month] = installment.due_date.split("-").map(Number);
  return year * 12 + month;
}

function todayMonthIndex(): number {
  const today = new Date();
  return today.getFullYear() * 12 + (today.getMonth() + 1);
}

/** Whether `installment` already fell in the current month or earlier - the app
 * doesn't track a literal "paid" flag, so this is the closest available proxy
 * (matches whichever months it has already counted toward in the dashboard). */
export function isPastOrCurrentMonth(installment: Installment): boolean {
  return effectiveMonthIndex(installment) <= todayMonthIndex();
}

export interface InstallmentsSummary {
  total: number;
  pastCount: number;
  upcomingCount: number;
  advancedCount: number;
  totalFinal: number;
  pastTotal: number;
  upcomingTotal: number;
  adjustmentsTotal: number;
}

export function summarizeInstallments(installments: Installment[]): InstallmentsSummary {
  let pastCount = 0;
  let advancedCount = 0;
  let totalFinal = 0;
  let pastTotal = 0;
  let adjustmentsTotal = 0;

  for (const installment of installments) {
    const final = parseFloat(installment.final_amount);
    totalFinal += final;
    if (isAdvanced(installment)) advancedCount += 1;
    if (isPastOrCurrentMonth(installment)) {
      pastCount += 1;
      pastTotal += final;
    }
    for (const adjustment of installment.adjustments) {
      adjustmentsTotal += parseFloat(adjustment.amount);
    }
  }

  return {
    total: installments.length,
    pastCount,
    upcomingCount: installments.length - pastCount,
    advancedCount,
    totalFinal,
    pastTotal,
    upcomingTotal: totalFinal - pastTotal,
    adjustmentsTotal,
  };
}
