import type { Currency } from "../types";

export const CURRENCY_LOCALE: Record<Currency, string> = {
  BRL: "pt-BR",
  USD: "en-US",
  EUR: "de-DE",
};

/** Formats BRL amounts in `currency`, converting with `rates` (units of `currency` per
 * 1 BRL). Display only - stored values are always BRL. */
export function makeCurrencyFormatter(currency: Currency, rates: Record<Currency, number>) {
  const formatter = new Intl.NumberFormat(CURRENCY_LOCALE[currency], { style: "currency", currency });
  return (amountBRL: string | number) => {
    const value = typeof amountBRL === "string" ? parseFloat(amountBRL) : amountBRL;
    return formatter.format(value * (rates[currency] ?? 1));
  };
}

/** Formats an amount already converted to `currency` (no conversion applied). */
export function makeDisplayFormatter(currency: Currency) {
  const formatter = new Intl.NumberFormat(CURRENCY_LOCALE[currency], { style: "currency", currency });
  return (amount: number) => formatter.format(amount);
}
