import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { FilterChips } from "./table/FilterChips";
import { CurrencyExchangeIcon, XIcon } from "./table/icons";
import { getExchangeRateForDate } from "../services/configApi";
import { formatCurrencyValue } from "../utils/formatCurrencyValue";
import type { Currency } from "../types";

interface HistoricalCurrencyConverterProps {
  /** The FX snapshot date to convert at - always `exchange_rate_date`, so the value
   * shown is what was actually worth that day, never today's rate. */
  date: string;
  /** The canonical BRL amount (entry.amount / expense.amount). */
  amountBRL: string;
  /** The currency actually entered, and its amount in that currency - already known
   * exactly, no conversion/fetch needed when this option is picked. */
  nativeCurrency: Currency;
  nativeOriginalAmount: string;
}

const ALL_CURRENCIES: { value: Currency; label: string }[] = [
  { value: "BRL", label: "BRL" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
];

export function HistoricalCurrencyConverter({
  date,
  amountBRL,
  nativeCurrency,
  nativeOriginalAmount,
}: HistoricalCurrencyConverterProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Currency>(nativeCurrency);

  const needsFetch = selected !== "BRL" && selected !== nativeCurrency;
  const ratesQuery = useQuery({
    queryKey: ["exchange-rate-for-date", date],
    queryFn: () => getExchangeRateForDate(date),
    enabled: open && needsFetch,
    staleTime: Infinity, // a past date's PTAX closing rate never changes once published
  });

  let resultText = "";
  if (selected === "BRL") {
    resultText = formatCurrencyValue(amountBRL, "BRL");
  } else if (selected === nativeCurrency) {
    resultText = formatCurrencyValue(nativeOriginalAmount, nativeCurrency);
  } else if (ratesQuery.data) {
    resultText = formatCurrencyValue(parseFloat(amountBRL) * ratesQuery.data.rates[selected], selected);
  } else if (ratesQuery.isError) {
    resultText = "indisponível";
  } else {
    resultText = "calculando...";
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs font-medium text-cartuga-600 hover:underline dark:text-cartuga-400"
      >
        <CurrencyExchangeIcon className="h-3.5 w-3.5" />
        Comparar com outra moeda naquele dia
      </button>
    );
  }

  const formattedDate = new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR");

  return (
    <div className="inline-flex max-w-full flex-col gap-1 rounded-lg bg-neutral-50 py-1.5 px-2.5 dark:bg-neutral-800/60">
      <div className="flex flex-wrap items-center gap-2">
        <FilterChips
          options={ALL_CURRENCIES}
          value={selected}
          onChange={setSelected}
          aria-label="Ver equivalente em outra moeda naquele dia"
        />
        <span className="whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">
          = <span className="font-semibold text-neutral-800 dark:text-neutral-100">{resultText}</span>
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Fechar comparação"
          className="ml-1 rounded p-0.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      {/* Static regardless of the currency selected/loading above - never causes the
          box to change size as the user clicks between currencies. */}
      <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
        Representa o valor real deste registro em {formattedDate}, não o valor de hoje.
      </p>
    </div>
  );
}
