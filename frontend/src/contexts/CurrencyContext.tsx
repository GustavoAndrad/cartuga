import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { AuthContext } from "./AuthContext";
import { getExchangeRates } from "../services/configApi";
import type { Currency } from "../types";
import { makeCurrencyFormatter } from "../utils/currencyFormat";

interface CurrencyContextValue {
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  rates: Record<Currency, number>;
  convert: (amountBRL: string | number) => number;
  format: (amountBRL: string | number) => string;
}

// eslint-disable-next-line react-refresh/only-export-components
export const CurrencyContext = createContext<CurrencyContextValue | undefined>(undefined);

const STORAGE_KEY = "cartuga-currency";
const DEFAULT_RATES: Record<Currency, number> = { BRL: 1, USD: 1, EUR: 1 };

function getInitialCurrency(): Currency {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "BRL" || stored === "USD" || stored === "EUR") return stored;
  return "BRL";
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const auth = useContext(AuthContext);
  const [currency, setCurrencyState] = useState<Currency>(getInitialCurrency);
  const [rates, setRates] = useState<Record<Currency, number>>(DEFAULT_RATES);

  useEffect(() => {
    if (auth?.status !== "authenticated") return;
    getExchangeRates()
      .then((data) => setRates(data.rates))
      .catch(() => undefined);
  }, [auth?.status]);

  const setCurrency = useCallback((next: Currency) => {
    setCurrencyState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const convert = useCallback(
    (amountBRL: string | number) => {
      const value = typeof amountBRL === "string" ? parseFloat(amountBRL) : amountBRL;
      return value * (rates[currency] ?? 1);
    },
    [currency, rates]
  );

  const format = useMemo(() => makeCurrencyFormatter(currency, rates), [currency, rates]);

  const value = useMemo(
    () => ({ currency, setCurrency, rates, convert, format }),
    [currency, setCurrency, rates, convert, format]
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}
