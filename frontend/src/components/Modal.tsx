import { useEffect, useId, type ReactNode } from "react";

import { XIcon } from "./table/icons";

type ModalSize = "md" | "xl" | "2xl";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
}

const SIZE_CLASS: Record<ModalSize, string> = {
  md: "max-w-lg",
  xl: "max-w-5xl",
  "2xl": "max-w-7xl",
};

export function Modal({ open, onClose, title, children, footer, size = "md" }: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className={`max-h-[90vh] w-full ${SIZE_CLASS[size]} overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-neutral-900`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-neutral-200 pb-4 dark:border-neutral-800">
          <h2 id={titleId} className="min-w-0 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="shrink-0 rounded-full p-1.5 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        <div>{children}</div>
        {footer && (
          <div className="mt-6 flex justify-end gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
