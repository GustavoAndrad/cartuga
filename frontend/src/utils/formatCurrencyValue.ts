import { CURRENCY_LOCALE } from "./currencyFormat";
import type { Currency } from "../types";

/** Formats `amount` as `currency` directly - no conversion, unlike CurrencyAmount
 * (which always converts a BRL value into the globally selected display currency). */
export function formatCurrencyValue(amount: string | number, currency: Currency): string {
  const numeric = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat(CURRENCY_LOCALE[currency], { style: "currency", currency }).format(numeric);
}
