import { useEffect, useRef, useState } from "react";

interface InfoTooltipProps {
  text: string;
  /** Where the bubble opens - "top" for triggers near the bottom of a container. */
  placement?: "bottom" | "top";
  /** Horizontal anchoring - "end" keeps it inside containers that clip on the right. */
  align?: "center" | "end";
}

export function InfoTooltip({ text, placement = "bottom", align = "center" }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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
    <div
      ref={ref}
      className="relative inline-flex"
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Mais informações"
        aria-expanded={open}
        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-neutral-300 text-[11px] font-bold leading-none text-neutral-500 hover:border-cartuga-500 hover:bg-cartuga-50 hover:text-cartuga-700 dark:border-neutral-600 dark:text-neutral-300 dark:hover:border-cartuga-500 dark:hover:bg-cartuga-900/40 dark:hover:text-cartuga-300"
      >
        ?
      </button>
      {open && (
        <div
          role="tooltip"
          className={`absolute z-50 w-56 rounded-lg ${placement === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"} ${
            align === "end" ? "right-0" : "left-1/2 -translate-x-1/2"
          } border border-neutral-200 bg-[var(--color-surface)] p-2.5 text-xs font-normal normal-case leading-relaxed text-neutral-600 shadow-lg dark:border-neutral-700 dark:text-neutral-300`}
        >
          {text}
        </div>
      )}
    </div>
  );
}
