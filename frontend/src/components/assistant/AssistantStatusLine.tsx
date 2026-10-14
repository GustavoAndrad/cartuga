import { useQuery } from "@tanstack/react-query";

import { getAssistantStatus } from "../../services/assistantApi";

const SOURCE_LABEL: Record<string, string> = { user: "sua chave", system: "padrão do servidor" };

/** "● Ativo · model · whose key" - what's answering right now, at a glance. */
export function AssistantStatusLine({ className = "" }: { className?: string }) {
  const { data: status } = useQuery({ queryKey: ["assistant", "status"], queryFn: getAssistantStatus });
  if (!status) return <span className={`text-xs text-neutral-400 ${className}`}>Verificando...</span>;

  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 ${className}`}>
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.enabled ? "bg-cartuga-500" : "bg-amber-500"}`}
        aria-hidden
      />
      <span className="truncate">
        {status.enabled
          ? `Ativo · ${status.model}${SOURCE_LABEL[status.source] ? ` · ${SOURCE_LABEL[status.source]}` : ""}`
          : "Não configurado"}
      </span>
    </span>
  );
}
