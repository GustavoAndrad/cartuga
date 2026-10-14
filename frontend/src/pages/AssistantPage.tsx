import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { AssistantAvatar } from "../components/assistant/AssistantAvatar";
import { AssistantStatusLine } from "../components/assistant/AssistantStatusLine";
import { ChatPanel } from "../components/assistant/ChatPanel";
import { ChatBubbleIcon, PlusIcon } from "../components/assistant/icons";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ClockIcon, TrashIcon } from "../components/table/icons";
import { useCurrentConversation } from "../hooks/useCurrentConversation";
import { useToast } from "../hooks/useToast";
import {
  deleteAllConversations,
  deleteConversation,
  getAssistantStatus,
  listConversations,
  type ChatConversation,
} from "../services/assistantApi";

function dayGroup(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(date)) / 86_400_000);
  if (days <= 0) return "Hoje";
  if (days === 1) return "Ontem";
  return "Últimos 7 dias";
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return dayGroup(iso) === "Hoje"
    ? date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function AssistantPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [conversationId, setConversationId] = useCurrentConversation();
  const [confirmClear, setConfirmClear] = useState(false);

  const statusQuery = useQuery({ queryKey: ["assistant", "status"], queryFn: getAssistantStatus });
  const conversationsQuery = useQuery({ queryKey: ["assistant", "conversations"], queryFn: listConversations });
  const conversations = useMemo(() => conversationsQuery.data ?? [], [conversationsQuery.data]);

  const groups = useMemo(() => {
    const map = new Map<string, ChatConversation[]>();
    for (const c of conversations) {
      const key = dayGroup(c.updated_at);
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return Array.from(map.entries());
  }, [conversations]);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteConversation(id),
    onSuccess: (_, id) => {
      if (id === conversationId) setConversationId(null);
      queryClient.invalidateQueries({ queryKey: ["assistant"] });
    },
  });
  const clearMutation = useMutation({
    mutationFn: deleteAllConversations,
    onSuccess: () => {
      setConversationId(null);
      setConfirmClear(false);
      queryClient.invalidateQueries({ queryKey: ["assistant"] });
      showToast("Histórico do assistente apagado.", "success");
    },
  });

  const historyDays = statusQuery.data?.history_days ?? 7;

  const list = (
    <nav aria-label="Conversas" className="flex flex-col gap-4">
      {groups.map(([label, items]) => (
        <div key={label}>
          <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{label}</p>
          <ul className="flex flex-col gap-0.5">
            {items.map((c) => {
              const active = c.id === conversationId;
              return (
                <li key={c.id}>
                  <div
                    className={`group relative flex items-center rounded-lg transition-colors ${
                      active
                        ? "bg-cartuga-50 text-cartuga-900 dark:bg-cartuga-900/30 dark:text-cartuga-100"
                        : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800/70"
                    }`}
                  >
                    {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-cartuga-600" aria-hidden />}
                    <button
                      type="button"
                      onClick={() => setConversationId(c.id)}
                      aria-current={active ? "true" : undefined}
                      className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5 pl-3 pr-1 text-left"
                    >
                      <ChatBubbleIcon
                        className={`h-3.5 w-3.5 shrink-0 ${active ? "text-cartuga-600 dark:text-cartuga-400" : "text-neutral-400"}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px]">{c.title}</span>
                        <span className="block text-[10px] text-neutral-400">{formatWhen(c.updated_at)}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(c.id)}
                      aria-label={`Apagar conversa ${c.title}`}
                      title="Apagar conversa"
                      className="mr-1 rounded-md p-1 text-neutral-400 transition-opacity hover:bg-red-50 hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100 dark:hover:bg-red-950/40"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <AssistantAvatar className="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Assistente Cartuga</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Seus gastos, o sistema e finanças em geral.</p>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-neutral-300 bg-[var(--color-surface)] px-3 py-1.5 dark:border-neutral-700">
          <AssistantStatusLine className="max-w-[16rem]" />
          <Link to="/profile" className="text-xs font-medium text-cartuga-700 hover:underline dark:text-cartuga-300">
            Configurar
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="flex flex-col gap-3 rounded-xl border border-neutral-300 bg-[var(--color-surface)] p-3 dark:border-neutral-800 lg:h-[calc(100vh-14rem)]">
          <button
            type="button"
            onClick={() => setConversationId(null)}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-cartuga-600 px-3 py-1.5 text-[13px] font-medium text-cartuga-700 transition-colors hover:bg-cartuga-50 dark:border-cartuga-500 dark:text-cartuga-300 dark:hover:bg-cartuga-900/30"
          >
            <PlusIcon className="h-4 w-4" />
            Nova conversa
          </button>

          <details className="lg:hidden">
            <summary className="cursor-pointer px-1 text-sm text-neutral-600 dark:text-neutral-300">
              Conversas anteriores ({conversations.length})
            </summary>
            <div className="mt-3">{list}</div>
          </details>
          <div className="hidden min-h-0 flex-1 overflow-y-auto lg:block">
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-2 py-8 text-center text-xs text-neutral-400">
                <ChatBubbleIcon className="h-6 w-6" />
                Suas conversas aparecem aqui.
              </div>
            ) : (
              list
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-neutral-200 pl-1 pt-2.5 text-[11px] text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
            <span className="flex min-w-0 items-center gap-1.5" title="O histórico é apagado automaticamente">
              <ClockIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Guardadas por {historyDays} dias</span>
            </span>
            {conversations.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                title="Apagar todo o histórico"
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 font-medium text-neutral-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-neutral-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                Limpar
              </button>
            )}
          </div>
        </aside>

        <section className="h-[calc(100vh-12rem)] min-h-[28rem] overflow-hidden rounded-xl border border-neutral-300 bg-[var(--color-surface)] dark:border-neutral-800 lg:h-[calc(100vh-14rem)]">
          <ChatPanel conversationId={conversationId} onConversationChange={setConversationId} variant="page" />
        </section>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Apagar todo o histórico?"
        message="Todas as suas conversas com o assistente serão apagadas. Esta ação não poderá ser desfeita."
        confirmLabel="Apagar"
        loading={clearMutation.isPending}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => clearMutation.mutate()}
      />
    </div>
  );
}
