import { useRef } from "react";

import { CalendarIcon } from "./table/icons";

interface DateInputProps {
  value: string;
  onChange: (value: string) => void;
  className: string;
  required?: boolean;
  disabled?: boolean;
}

export function DateInput({ value, onChange, className, required, disabled }: DateInputProps) {
  const ref = useRef<HTMLInputElement>(null);

  function openPicker() {
    const el = ref.current;
    if (!el || disabled || typeof el.showPicker !== "function") return;
    try {
      el.showPicker();
    } catch {
      // Some browsers refuse showPicker() outside a direct user gesture - the
      // native picker-indicator click (still present, just visually hidden) is
      // the fallback in that case.
    }
  }

  return (
    <div className={`relative ${disabled ? "" : "cursor-pointer"}`} onClick={openPicker}>
      <input
        ref={ref}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        className={`${className} pr-9 ${disabled ? "" : "cursor-pointer"}`}
      />
      <CalendarIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
    </div>
  );
}
