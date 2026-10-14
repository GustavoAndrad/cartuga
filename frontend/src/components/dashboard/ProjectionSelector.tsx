import { useState } from "react";

interface ProjectionSelectorProps {
  months: number;
  onChange: (months: number) => void;
}

const PRESETS = [3, 6, 12, 24];

const chipClass = (active: boolean) =>
  `px-3 py-1.5 text-sm font-medium transition-colors ${
    active
      ? "bg-cartuga-600 text-white"
      : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
  }`;

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 20.6 7.4 19.2 6 9 16.2Z" />
    </svg>
  );
}

export function ProjectionSelector({ months, onChange }: ProjectionSelectorProps) {
  const isPreset = PRESETS.includes(months);
  const [customOpen, setCustomOpen] = useState(!isPreset);
  const [customValue, setCustomValue] = useState(isPreset ? "" : String(months));

  function selectPreset(preset: number) {
    setCustomOpen(false);
    onChange(preset);
  }

  function openCustom() {
    setCustomOpen(true);
    setCustomValue(String(months));
  }

  function applyCustom() {
    const parsed = parseInt(customValue, 10);
    if (parsed > 0 && parsed <= 60) onChange(parsed);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-neutral-500 dark:text-neutral-400">Projeção:</span>
      <div className="flex overflow-hidden rounded-lg border border-neutral-300 dark:border-neutral-700">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => selectPreset(preset)}
            className={chipClass(months === preset && !customOpen)}
          >
            {preset}m
          </button>
        ))}
        <button type="button" onClick={openCustom} className={chipClass(customOpen)}>
          Personalizado
        </button>
      </div>

      {customOpen && (
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            max={60}
            autoFocus
            placeholder="Meses"
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            className="w-20 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 focus:border-cartuga-500 focus:outline-none focus:ring-1 focus:ring-cartuga-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
          />
          <button
            type="button"
            onClick={applyCustom}
            aria-label="Aplicar período personalizado"
            className="rounded-lg bg-cartuga-600 p-1.5 text-white hover:bg-cartuga-700 dark:bg-cartuga-500 dark:hover:bg-cartuga-400"
          >
            <CheckIcon />
          </button>
        </div>
      )}
    </div>
  );
}
