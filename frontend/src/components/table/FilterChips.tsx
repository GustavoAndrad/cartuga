interface FilterChipsProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  "aria-label"?: string;
  className?: string;
  disabled?: boolean;
  fullWidth?: boolean;
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  "aria-label": ariaLabel,
  className = "",
  disabled = false,
  fullWidth = false,
}: FilterChipsProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`flex overflow-hidden rounded-lg border border-neutral-300 text-xs dark:border-neutral-700 ${
        disabled ? "opacity-50" : ""
      } ${className}`}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={`px-2.5 py-1.5 font-medium transition-colors disabled:cursor-not-allowed ${
            fullWidth ? "flex-1 text-center" : ""
          } ${
            opt.value === value
              ? "bg-cartuga-600 text-white"
              : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
