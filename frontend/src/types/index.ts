export type UserRole = "USER" | "ADMIN";
export type RecurrenceType = "FIXED" | "EXCEPTIONAL";
export type PaymentMethod = "CONTA" | "CREDITO";
export type Currency = "BRL" | "USD" | "EUR";
export type VaultTransactionType = "DEPOSIT_FRESH" | "DEPOSIT_CARVE" | "WITHDRAWAL";
export type CarveMode = "PERCENTAGE" | "FIXED";

export interface User {
  id: number;
  name: string;
  email: string;
  photo: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface InstallmentAdjustment {
  id: number;
  installment_id: number;
  amount: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface Installment {
  id: number;
  expense_id: number;
  installment_number: number;
  total_installments: number;
  due_date: string;
  base_amount: string;
  /** Set together when this installment was paid early - see finance_engine's docs. */
  advanced_to_year: number | null;
  advanced_to_month: number | null;
  final_amount: string;
  adjustments: InstallmentAdjustment[];
  created_at: string;
  updated_at: string;
}

export interface Entry {
  id: number;
  user_id: number;
  date: string;
  /** BRL-canonical amount - always converted, use this everywhere except the currency detail block. */
  amount: string;
  currency: Currency;
  /** The amount as originally entered, in `currency`. */
  original_amount: string;
  /** BRL per 1 unit of `currency`, as of `exchange_rate_date`. */
  exchange_rate: string;
  exchange_rate_date: string;
  description: string;
  source: string;
  type: RecurrenceType;
  /** False only for a Cofre "guardar do zero" deposit entry - excluded from every dashboard total. */
  counts_toward_dashboard: boolean;
  /** True when a Cofre transaction generated this entry - date/amount/currency/type are read-only. */
  is_vault_locked: boolean;
  /** Speculative/estimated entry, not yet confirmed - still counts normally everywhere,
   * this is purely a review-workflow marker. True for either an EXCEPTIONAL entry
   * (confirm/reject once) or a FIXED one (reviewed one month at a time). */
  is_planned: boolean;
  /** FIXED + is_planned only - when the monthly review backlog starts. Null for EXCEPTIONAL. */
  is_planned_since: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntryInput {
  date: string;
  /** The amount as entered by the user, in `currency` - not necessarily BRL. */
  amount: string;
  currency: Currency;
  description: string;
  source: string;
  type: RecurrenceType;
  start_date: string | null;
  end_date: string | null;
  is_planned: boolean;
}

export interface Expense {
  id: number;
  user_id: number;
  date: string;
  /** BRL-canonical amount - always converted, use this everywhere except the currency detail block. */
  amount: string;
  currency: Currency;
  /** The amount as originally entered, in `currency`. */
  original_amount: string;
  /** BRL per 1 unit of `currency`, as of `exchange_rate_date`. */
  exchange_rate: string;
  exchange_rate_date: string;
  description: string;
  source: string;
  type: RecurrenceType;
  payment_method: PaymentMethod;
  start_date: string | null;
  end_date: string | null;
  installments: Installment[];
  /** True when a Cofre recorte generated this expense - date/amount/currency/type are read-only. */
  is_vault_locked: boolean;
  /** Speculative/estimated expense, not yet confirmed - still counts normally
   * everywhere. True for a CONTA expense of either type: EXCEPTIONAL (confirm/reject
   * once) or FIXED (reviewed one month at a time). Never CREDITO. */
  is_planned: boolean;
  /** FIXED + is_planned only - when the monthly review backlog starts. Null for EXCEPTIONAL. */
  is_planned_since: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseInput {
  date: string;
  /** The amount as entered by the user, in `currency` - not necessarily BRL. */
  amount: string;
  currency: Currency;
  description: string;
  source: string;
  type: RecurrenceType;
  payment_method: PaymentMethod;
  start_date: string | null;
  end_date: string | null;
  installments_count?: number | null;
  is_planned: boolean;
}

export interface DistributionItem {
  label: string;
  total: string;
}

export interface Distribution {
  by_source: DistributionItem[];
  by_type: DistributionItem[];
}

export interface DashboardCards {
  current_balance: string;
  previous_month_balance: string;
  current_month_income: string;
  current_month_expenses: string;
  projected_balance: string;
  committed_installments: string;
  vault_balance: string;
}

export interface MonthPoint {
  year: number;
  month: number;
  entries_total: string;
  expenses_total: string;
  balance: string;
  cumulative_balance: string;
  is_projected: boolean;
}

/** Months a month-by-month chart can be scrolled through: from the first month with
 * any data up to the last month where anything still changes the balance. */
export interface NavigableRange {
  first_year: number;
  first_month: number;
  last_year: number;
  last_month: number;
  /** HORIZON: capped at the app-wide 60-month projection limit (an open-ended fixed
   * rule keeps going). LAST_RECORD: nothing changes the balance after `last`. */
  last_reason: "HORIZON" | "LAST_RECORD";
}

export interface DashboardData {
  current_month: { year: number; month: number };
  cards: DashboardCards;
  time_series: MonthPoint[];
  navigable_range: NavigableRange;
  entries_distribution: Distribution;
  expenses_distribution: Distribution;
}

export interface MonthExpenseLine {
  expense_id: number;
  description: string;
  source: string;
  type: RecurrenceType;
  payment_method: PaymentMethod;
  amount: string;
  date: string;
  installment: Installment | null;
  /** Always false for a CREDITO installment line - only a CONTA+EXCEPTIONAL expense
   * can ever be Planejado. */
  is_planned: boolean;
}

export interface MonthDetail {
  year: number;
  month: number;
  entries: Entry[];
  expenses: MonthExpenseLine[];
  entries_total: string;
  expenses_total: string;
  balance: string;
  entries_distribution: Distribution;
  expenses_distribution: Distribution;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export interface ImportIssue {
  sheet: string;
  row: number | null;
  message: string;
}

export interface ImportPreview {
  valid: boolean;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  counts: Record<string, number>;
}

export interface ImportConfirmResult {
  counts: Record<string, number>;
  temporary_passwords: Record<string, string>;
}

export interface VaultTransaction {
  id: number;
  user_id: number;
  type: VaultTransactionType;
  date: string;
  amount: string;
  description: string;
  entry_id: number | null;
  expense_id: number | null;
  source_entry_id: number | null;
  carve_mode: CarveMode | null;
  carve_percentage: string | null;
  entry: Entry | null;
  expense: Expense | null;
  source_entry: Entry | null;
  created_at: string;
  updated_at: string;
}

export interface VaultTransactionInput {
  type: VaultTransactionType;
  date: string;
  description: string;
  amount?: string;
  source_entry_id?: number;
  carve_mode?: CarveMode;
  carve_value?: string;
}

export interface CarveableEntry {
  entry: Entry;
  remaining_amount: string;
}

export interface VaultMonthPoint {
  year: number;
  month: number;
  deposits_total: string;
  withdrawals_total: string;
  net: string;
  cumulative_balance: string;
}

export interface VaultSummary {
  balance: string;
  total_deposited: string;
  total_withdrawn: string;
  monthly_series: VaultMonthPoint[];
}

export interface ImpactPoint {
  year: number;
  month: number;
  direct_amount: string;
  cumulative_with: string;
  cumulative_without: string;
  cumulative_impact: string;
  is_projected: boolean;
}

export interface Impact {
  active_from_year: number;
  active_from_month: number;
  /** null only when the record has no end date (an indefinite FIXED entry/expense). */
  active_until_year: number | null;
  active_until_month: number | null;
  is_indefinite: boolean;
  /** The chart's last month - the app's max projection horizon. */
  horizon_year: number;
  horizon_month: number;
  points: ImpactPoint[];
}

export interface PendingEntryItem {
  entry: Entry;
  /** Sort/group key: the entry's own `date` (EXCEPTIONAL) or the 1st of the
   * occurrence's month (FIXED). */
  review_date: string;
  /** Set only for a FIXED entry's specific monthly occurrence - null for EXCEPTIONAL. */
  occurrence_year: number | null;
  occurrence_month: number | null;
}

export interface PendingExpenseItem {
  expense: Expense;
  review_date: string;
  occurrence_year: number | null;
  occurrence_month: number | null;
}

export interface PendingReview {
  entries: PendingEntryItem[];
  expenses: PendingExpenseItem[];
}

export type OccurrenceReviewStatus = "CONFIRMED" | "REJECTED";

export interface OccurrenceReview {
  id: number;
  year: number;
  month: number;
  status: OccurrenceReviewStatus;
  override_amount: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlannedComparisonPoint {
  year: number;
  month: number;
  entries_total: string;
  planned_entries_total: string;
  expenses_total: string;
  planned_expenses_total: string;
  cumulative_with_planned: string;
  cumulative_without_planned: string;
  is_projected: boolean;
}

export interface PlannedComparison {
  /** False when the user has never marked anything as Planejado - the whole
   * com/sem-planejados comparison is moot in that case. */
  has_planned: boolean;
  points: PlannedComparisonPoint[];
  navigable_range: NavigableRange;
}

export type BankName = "INTER" | "NUBANK";
export type ImportKind = "ENTRADA" | "SAIDA" | "GUARDAR" | "RETIRAR";

export interface BankImportRow {
  kind: ImportKind;
  /** null when the parser couldn't identify it from the file - must be filled in review. */
  date: string | null;
  amount: string | null;
  description: string;
  /** ENTRADA/SAIDA only. */
  source: string;
  /** SAIDA only. */
  payment_method: PaymentMethod | null;
  warnings: string[];
  raw: Record<string, string>;
}

export interface BankImportPreview {
  rows: BankImportRow[];
  file_warnings: string[];
}

export interface BankImportRowResult {
  index: number;
  status: "created" | "error";
  message: string | null;
  entry_id: number | null;
  expense_id: number | null;
  vault_transaction_id: number | null;
}

export interface BankImportCommitResult {
  created: number;
  failed: number;
  results: BankImportRowResult[];
}
