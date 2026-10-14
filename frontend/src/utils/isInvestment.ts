/** Every entry/expense the Cofre generates is tagged with this exact source - reserved
 * on the backend so a manually created entry/expense can't take it on (see
 * entry_service/expense_service). This is the one place that decides whether an
 * investment marker should show up. */
export const VAULT_SOURCE_LABEL = "Investimento";

export function isInvestmentSource(source: string): boolean {
  return source === VAULT_SOURCE_LABEL;
}
