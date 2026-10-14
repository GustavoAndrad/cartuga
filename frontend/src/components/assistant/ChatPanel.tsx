import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { extractErrorMessage } from "../../services/api";
import {
  createConversation,
  getAssistantStatus,
  getConversation,
  sendMessage,
  type ChatMessage,
} from "../../services/assistantApi";
import { InfoTooltip } from "../InfoTooltip";
import { Spinner } from "../Spinner";
import { AssistantAvatar } from "./AssistantAvatar";
import {
  BookIcon,
  ChartIcon,
  CheckSmallIcon,
  CoinIcon,
  CopyIcon,
  DatabaseIcon,
  SendIcon,
  ShieldIcon,
  StepsIcon,
  WarningIcon,
} from "./icons";
import { MarkdownText } from "./MarkdownText";
import { TraceView } from "./TraceView";

const MAX_CHARS = 1000;
const COUNTER_FROM = 800;

type SuggestionGroup = "numbers" | "howto" | "finance";

const SUGGESTION_ICON: Record<SuggestionGroup, ReactNode> = {
  numbers: <ChartIcon className="h-3.5 w-3.5" />,
  howto: <BookIcon className="h-3.5 w-3.5" />,
  finance: <CoinIcon className="h-3.5 w-3.5" />,
};

// The pop-up shows the first four (fits without scrolling); the page shows them all.
const SUGGESTIONS: { group: SuggestionGroup; text: string }[] = [
  { group: "numbers", text: "Quanto gastei este mês?" },
  { group: "numbers", text: "Com o que mais gastei nos últimos 3 meses?" },
  { group: "howto", text: "Como funcionam as compras parceladas?" },
  { group: "finance", text: "O que é reserva de emergência?" },
  {
    group: "numbers",
    text: "Tenho dinheiro para uma compra de R$ 1.500 em 5x?",
  },
  { group: "numbers", text: "Quanto vou ter de saldo no fim do ano?" },
  { group: "howto", text: "O que é um lançamento planejado?" },
  { group: "finance", text: "Qual a cotação do dólar hoje?" },
];
const POPUP_SUGGESTIONS = 4;

interface ChatPanelProps {
  conversationId: number | null;
  onConversationChange: (id: number | null) => void;
  variant: "popup" | "page";
}

function timeOf(iso: string): string {
  return iso
    ? new Date(iso).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
}

export function ChatPanel({ conversationId, onConversationChange, variant }: ChatPanelProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [error, setError] = useState<{
    message: string;
    question: string;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const statusQuery = useQuery({
    queryKey: ["assistant", "status"],
    queryFn: getAssistantStatus,
  });
  const conversationQuery = useQuery({
    queryKey: ["assistant", "conversation", conversationId],
    queryFn: () => getConversation(conversationId!),
    enabled: conversationId !== null,
    retry: false,
  });
  const messages = conversationQuery.data?.messages ?? [];

  const mutation = useMutation({
    mutationFn: async (question: string) => {
      let id = conversationId;
      if (id === null) {
        id = (await createConversation()).id;
        onConversationChange(id);
      }
      await sendMessage(id, question);
      return id;
    },
    onMutate: (question) => {
      setPendingQuestion(question);
      setError(null);
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({
        queryKey: ["assistant", "conversation", id],
      });
      queryClient.invalidateQueries({
        queryKey: ["assistant", "conversations"],
      });
      queryClient.invalidateQueries({ queryKey: ["assistant", "status"] });
    },
    onError: (err, question) => {
      // Nothing was stored server-side - give the question back so it can be resent.
      setError({
        message: extractErrorMessage(err, "Não consegui responder agora."),
        question,
      });
      setDraft((d) => d || question);
      queryClient.invalidateQueries({ queryKey: ["assistant", "status"] });
    },
    onSettled: () => setPendingQuestion(null),
  });

  // The remembered conversation expired (history retention) or was deleted elsewhere:
  // start a fresh one instead of showing an error.
  useEffect(() => {
    if (conversationQuery.isError) onConversationChange(null);
  }, [conversationQuery.isError, onConversationChange]);

  // Follow the conversation as it grows - but an empty one stays at the top, so the
  // greeting and suggestions are what's seen first.
  useEffect(() => {
    if (messages.length === 0 && !pendingQuestion && !error) return;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, pendingQuestion, error]);

  // Switching conversation (or starting a new one) starts from the top, not from
  // wherever the previous one was scrolled to.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [conversationId]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  function submit(text: string) {
    const question = text.trim();
    if (!question || mutation.isPending || question.length > MAX_CHARS) return;
    setDraft("");
    mutation.mutate(question);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit(draft);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(draft);
    }
  }

  const status = statusQuery.data;
  const disabled = !!status && !status.enabled;
  const isEmpty = messages.length === 0 && !pendingQuestion;
  const isPage = variant === "page";
  // A comfortable reading column on the full page; the pop-up is already narrow.
  const column = isPage ? "mx-auto w-full max-w-3xl" : "w-full";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="chat-scroll min-h-0 flex-1 overflow-y-auto" aria-live="polite">
        <div className={`${column} flex flex-col gap-5 px-4 py-5 ${isPage ? "sm:px-6" : ""}`}>
          {conversationQuery.isLoading && <Spinner label="Carregando conversa..." />}

          {disabled && (
            <div className="mx-auto mt-6 flex max-w-md flex-col items-center gap-3 text-center">
              <AssistantAvatar className="h-12 w-12 opacity-60" />
              <div>
                <p className="font-semibold text-neutral-800 dark:text-neutral-100">Assistente indisponível</p>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{status.reason}</p>
              </div>
              <Link
                to="/profile"
                className="rounded-lg bg-cartuga-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cartuga-700 dark:bg-cartuga-500 dark:hover:bg-cartuga-400"
              >
                Configurar no Perfil
              </Link>
            </div>
          )}

          {status?.enabled && isEmpty && !conversationQuery.isLoading && (
            <EmptyState variant={variant} onPick={submit} />
          )}

          {messages.map((m) => (
            <MessageItem key={m.id} message={m} />
          ))}

          {pendingQuestion && (
            <>
              <MessageItem
                message={{
                  id: -1,
                  role: "USER",
                  content: pendingQuestion,
                  sources: null,
                  flags: null,
                  created_at: "",
                }}
              />
              <div className="flex gap-3">
                <AssistantAvatar className="h-8 w-8" />
                <div className="flex items-center gap-2.5 rounded-2xl rounded-tl-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-400">
                  <span className="flex gap-1" aria-hidden>
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cartuga-500 [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cartuga-500 [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cartuga-500" />
                  </span>
                  Consultando seus dados...
                </div>
              </div>
            </>
          )}

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
            >
              <WarningIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <p>{error.message}</p>
                <button
                  type="button"
                  onClick={() => {
                    setDraft("");
                    submit(error.question);
                  }}
                  className="mt-1 text-xs font-semibold underline underline-offset-2"
                >
                  Tentar de novo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-neutral-200 bg-[var(--color-surface)] dark:border-neutral-800"
      >
        <div className={`${column} px-3 pb-3 pt-3 ${isPage ? "sm:px-6" : ""}`}>
          <div
            className={`flex items-end gap-2 rounded-2xl border bg-white p-1.5 pl-3.5 transition-colors focus-within:border-cartuga-500 focus-within:ring-2 focus-within:ring-cartuga-500/20 dark:bg-neutral-900 ${
              disabled
                ? "border-neutral-200 opacity-60 dark:border-neutral-800"
                : "border-neutral-300 dark:border-neutral-700"
            }`}
          >
            <label htmlFor={`assistant-input-${variant}`} className="sr-only">
              Pergunta para o Assistente Cartuga
            </label>
            <textarea
              id={`assistant-input-${variant}`}
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={disabled || mutation.isPending}
              maxLength={MAX_CHARS}
              placeholder={
                disabled ? "Assistente indisponível" : "Pergunte sobre seus gastos, o sistema ou finanças..."
              }
              className="max-h-40 min-h-[2.25rem] flex-1 resize-none bg-transparent py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none disabled:cursor-not-allowed dark:text-neutral-50"
            />
            <button
              type="submit"
              disabled={disabled || mutation.isPending || !draft.trim()}
              aria-label="Enviar pergunta"
              title="Enviar (Enter)"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cartuga-600 text-white transition-colors hover:bg-cartuga-700 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400 dark:bg-cartuga-500 dark:hover:bg-cartuga-400 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-600"
            >
              <SendIcon className="h-4 w-4" />
            </button>
          </div>
          {/* Three columns: the notice stays centered whatever the counters on the right show. */}
          <div className="mt-1.5 grid grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2 px-1 text-[11px] text-neutral-500 dark:text-neutral-400">
            <span />
            <div className="flex min-w-0 items-center gap-1.5">
              <ShieldIcon className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
              <span className="truncate">Pode cometer imprecisões. Confira os valores.</span>
              <InfoTooltip
                placement="top"
                align="end"
                text={`O Assistente pode errar: confira os valores nas telas do sistema. Decisões financeiras merecem análise humana. Suas perguntas e os dados consultados vão para o provedor do modelo, com CPF, cartão, e-mail e telefone mascarados; não digite senhas.${
                  status ? ` As conversas ficam guardadas por ${status.history_days} dias.` : ""
                }`}
              />
            </div>
            <span className="flex items-center justify-end gap-2 whitespace-nowrap tabular-nums">
              {status?.enabled && status.remaining_this_hour !== null && status.remaining_this_hour <= 5 && (
                <span>{status.remaining_this_hour} restantes na hora</span>
              )}
              {draft.length >= COUNTER_FROM && (
                <span className={draft.length >= MAX_CHARS ? "text-red-500" : ""}>
                  {draft.length}/{MAX_CHARS}
                </span>
              )}
            </span>
          </div>
        </div>
      </form>
    </div>
  );
}

function EmptyState({ variant, onPick }: { variant: "popup" | "page"; onPick: (text: string) => void }) {
  const isPage = variant === "page";
  const items = isPage ? SUGGESTIONS : SUGGESTIONS.slice(0, POPUP_SUGGESTIONS);
  return (
    <div className={`flex flex-col items-center text-center ${isPage ? "gap-5 pt-10" : "gap-4 pt-2"}`}>
      <AssistantAvatar className={isPage ? "h-12 w-12" : "h-10 w-10"} />
      <div>
        <p className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-50">Como posso ajudar?</p>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
          Seus gastos, o sistema ou finanças em geral. Eu só leio seus dados.
        </p>
      </div>
      <div className={`flex flex-wrap justify-center gap-1.5 ${isPage ? "max-w-2xl" : ""}`}>
        {items.map((item) => (
          <button
            key={item.text}
            type="button"
            onClick={() => onPick(item.text)}
            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-[var(--color-surface)] px-3 py-1.5 text-xs text-neutral-700 transition-colors hover:border-cartuga-400 hover:bg-cartuga-50 hover:text-cartuga-800 dark:border-neutral-700 dark:text-neutral-200 dark:hover:border-cartuga-600 dark:hover:bg-cartuga-900/30 dark:hover:text-cartuga-100"
          >
            <span className="text-cartuga-600 dark:text-cartuga-400">{SUGGESTION_ICON[item.group]}</span>
            {item.text}
          </button>
        ))}
      </div>
    </div>
  );
}

const actionButton = (active: boolean) =>
  `inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors ${
    active
      ? "bg-cartuga-50 text-cartuga-800 dark:bg-cartuga-900/40 dark:text-cartuga-200"
      : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
  }`;

function Notice({ tone, children }: { tone: "caution" | "neutral"; children: ReactNode }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed ${
        tone === "caution"
          ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300"
          : "border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800/40 dark:text-neutral-300"
      }`}
    >
      <WarningIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function MessageItem({ message }: { message: ChatMessage }) {
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (message.role === "USER") {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-cartuga-600 px-4 py-2.5 text-sm text-white shadow-sm dark:bg-cartuga-700">
          {message.content}
        </div>
        {message.created_at && <span className="px-1 text-[10px] text-neutral-400">{timeOf(message.created_at)}</span>}
      </div>
    );
  }

  const flags = message.flags;
  const sources = message.sources ?? [];

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <div className="flex gap-3">
      <AssistantAvatar className="h-8 w-8" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-100">Assistente Cartuga</span>
          {message.created_at && <span className="text-[10px] text-neutral-400">{timeOf(message.created_at)}</span>}
        </div>

        <div className="break-words rounded-2xl rounded-tl-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm leading-relaxed text-neutral-800 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-100">
          <MarkdownText text={message.content} />
        </div>

        {flags?.caution && (
          <Notice tone="caution">
            <strong className="font-semibold">Simulação, não recomendação.</strong> Feita com os lançamentos já
            cadastrados; gastos que você ainda não registrou não entram. Avalie com cuidado e, para decisões
            importantes, converse com um profissional.
          </Notice>
        )}
        {flags && flags.unverified_amounts.length > 0 && (
          <Notice tone="neutral">
            Não encontrei nos seus dados: <strong>{flags.unverified_amounts.join(", ")}</strong>. Podem ser exemplos ou
            contas feitas pelo assistente; confira antes de usar.
          </Notice>
        )}

        <div className="-ml-1.5 flex flex-wrap items-center gap-0.5">
          {(sources.length > 0 || message.trace) && (
            <button
              type="button"
              onClick={() => setReasoningOpen(!reasoningOpen)}
              aria-expanded={reasoningOpen}
              title="Quais dados foram consultados e como a resposta foi montada, passo a passo"
              className={actionButton(reasoningOpen)}
            >
              <StepsIcon className="h-3.5 w-3.5" />
              Raciocínio
            </button>
          )}
          <button type="button" onClick={copy} className={actionButton(false)} title="Copiar resposta">
            {copied ? (
              <CheckSmallIcon className="h-3.5 w-3.5 text-cartuga-600" />
            ) : (
              <CopyIcon className="h-3.5 w-3.5" />
            )}
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>

        {reasoningOpen && (
          <div className="flex flex-col gap-2">
            {sources.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400">Dados consultados:</span>
                {sources.map((s) => (
                  <span
                    key={s.label}
                    className="inline-flex items-center gap-1 rounded-full border border-cartuga-200 bg-cartuga-50 px-2.5 py-0.5 text-[11px] text-cartuga-800 dark:border-cartuga-900/60 dark:bg-cartuga-900/30 dark:text-cartuga-200"
                  >
                    <DatabaseIcon className="h-3 w-3" />
                    {s.label}
                  </span>
                ))}
              </div>
            )}
            {message.trace && <TraceView trace={message.trace} />}
          </div>
        )}
      </div>
    </div>
  );
}
