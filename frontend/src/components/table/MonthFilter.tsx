import { useRef } from "react";

import { CalendarIcon, XIcon } from "./icons";

interface MonthFilterProps {
  value: string;
  onChange: (value: string) => void;
}

export function MonthFilter({ value, onChange }: MonthFilterProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function openPicker() {
    const el = inputRef.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
    }
  }

  return (
    <div
      onClick={openPicker}
      className="flex min-w-[13rem] cursor-pointer items-center gap-2 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm text-neutral-900 focus-within:border-cartuga-500 focus-within:ring-1 focus-within:ring-cartuga-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
    >
      <CalendarIcon className="h-4 w-4 shrink-0 text-neutral-400 dark:text-neutral-500" />
      <input
        ref={inputRef}
        type="month"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Filtrar por mês"
        className="w-full cursor-pointer bg-transparent [color-scheme:light] outline-none [&::-webkit-calendar-picker-indicator]:hidden dark:[color-scheme:dark]"
      />
      {value && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange("");
          }}
          aria-label="Limpar filtro de mês"
          className="shrink-0 text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
