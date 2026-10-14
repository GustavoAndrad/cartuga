import type { Toast as ToastData } from "../contexts/ToastContext";
import { useToast } from "../hooks/useToast";

const VARIANT_STYLES: Record<ToastData["variant"], string> = {
  success: "bg-cartuga-600 text-white",
  error: "bg-red-600 text-white",
  info: "bg-neutral-800 text-white",
};

export function ToastContainer() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-24 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm shadow-lg ${VARIANT_STYLES[toast.variant]}`}
        >
          <span>{toast.message}</span>
          <button
            onClick={() => dismissToast(toast.id)}
            aria-label="Fechar notificação"
            className="ml-2 opacity-80 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
