import { useContext } from "react";

import { CurrencyContext } from "../contexts/CurrencyContext";

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
