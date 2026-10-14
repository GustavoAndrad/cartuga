import { useEffect, useRef, useState } from "react";

import flagBR from "../assets/flags/br.svg";
import flagEU from "../assets/flags/eu.svg";
import flagUS from "../assets/flags/us.svg";
import { useCurrency } from "../hooks/useCurrency";
import type { Currency } from "../types";

const OPTIONS: { value: Currency; label: string; flag: string }[] = [
  { value: "BRL", label: "Real", flag: flagBR },
  { value: "USD", label: "Dólar", flag: flagUS },
  { value: "EUR", label: "Euro", flag: flagEU },
];

export function CurrencySelector() {
  const { currency, setCurrency } = useCurrency();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const current = OPTIONS.find((opt) => opt.value === currency) ?? OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Selecionar moeda"
        className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
      >
        <img src={current.flag} alt="" className="h-4 w-4 rounded-sm object-cover shadow-sm" />
        <span>{current.value}</span>
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className={`h-3.5 w-3.5 text-neutral-400 transition-transform dark:text-neutral-500 ${open ? "rotate-180" : ""}`}
        >
          <path d="M7 10l5 5 5-5H7Z" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Moedas disponíveis"
          className="absolute right-0 z-50 mt-1 w-36 overflow-hidden rounded-lg border border-neutral-300 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        >
          {OPTIONS.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                role="option"
                aria-selected={opt.value === currency}
                onClick={() => {
                  setCurrency(opt.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                  opt.value === currency
                    ? "bg-neutral-100 font-medium text-cartuga-700 dark:bg-neutral-800 dark:text-cartuga-300"
                    : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                }`}
              >
                <img src={opt.flag} alt="" className="h-4 w-4 rounded-sm object-cover shadow-sm" />
                <span>{opt.label}</span>
                <span className="ml-auto text-xs text-neutral-400 dark:text-neutral-500">{opt.value}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
