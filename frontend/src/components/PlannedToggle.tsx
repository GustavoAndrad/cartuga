import { CheckIcon, ClockIcon } from "./table/icons";

interface PlannedToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** The "Planejado" toggle shown in the entry/expense form when the chosen date isn't
 * today - styled as a full button rather than a bare native checkbox, matching the
 * rest of the app's card/chip visual language instead of the browser default. */
export function PlannedToggle({ checked, onChange }: PlannedToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
        checked
          ? "border-cartuga-300 bg-cartuga-50 text-cartuga-700 dark:border-cartuga-800 dark:bg-cartuga-900/30 dark:text-cartuga-300"
          : "border-neutral-300 bg-white text-neutral-500 hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:border-neutral-600"
      }`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          checked
            ? "border-cartuga-600 bg-cartuga-600 text-white dark:border-cartuga-400 dark:bg-cartuga-400 dark:text-neutral-900"
            : "border-neutral-300 dark:border-neutral-600"
        }`}
      >
        {checked && <CheckIcon className="h-3 w-3" />}
      </span>
      <ClockIcon className="h-4 w-4 shrink-0" />
      <span>Planejado: é uma estimativa, e você confirma o valor real depois</span>
    </button>
  );
}
