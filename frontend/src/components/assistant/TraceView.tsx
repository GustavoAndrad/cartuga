import { useState, type ReactNode } from "react";

import type { ChatTrace, TraceStep } from "../../services/assistantApi";

const KIND_STYLE: Record<string, string> = {
  request: "bg-neutral-400",
  context: "bg-neutral-400",
  llm: "bg-sky-500",
  tool: "bg-cartuga-500",
  grounding: "bg-amber-500",
  caution: "bg-amber-500",
  answer: "bg-cartuga-700",
  error: "bg-red-500",
};

const SOURCE_LABEL: Record<string, string> = {
  user: "sua própria chave",
  system: "padrão do servidor",
  none: "nenhum",
};

const ATTEMPT_LABEL: Record<string, string> = {
  ok: "ok",
  rate_limited: "limite do provedor atingido",
  auth_error: "chave recusada",
  model_not_found: "modelo não encontrado",
  out_of_memory: "sem memória para o modelo",
  provider_error: "erro do provedor",
  timeout: "tempo esgotado",
  unreachable: "provedor inacessível",
};

const MASKED_LABEL: Record<string, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  card: "cartão",
  email: "e-mail",
  phone: "telefone",
  pix: "chave Pix",
};

/** Personal data replaced by placeholders before reaching the model (backend privacy.py). */
function Masked({ redacted }: { redacted?: Record<string, number> | null }) {
  if (!redacted) return null;
  const items = Object.entries(redacted).map(([kind, n]) => `${MASKED_LABEL[kind] ?? kind} (${n})`);
  return (
    <p className="mt-1 text-cartuga-700 dark:text-cartuga-300">
      Dados pessoais mascarados antes do envio ao modelo: {items.join(", ")}
    </p>
  );
}

function seconds(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw; // clipped for size - show as received
  }
}

function args(value: unknown): string {
  const entries = Object.entries((value as Record<string, unknown>) ?? {});
  return entries.length ? entries.map(([k, v]) => `${k}: ${String(v)}`).join(", ") : "sem argumentos";
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="mt-1">
      <summary className="cursor-pointer select-none text-[11px] text-neutral-500 hover:text-cartuga-700 dark:text-neutral-400 dark:hover:text-cartuga-300">
        {label}
      </summary>
      <div className="mt-1">{children}</div>
    </details>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-neutral-100 p-2 font-mono text-[10.5px] leading-snug text-neutral-700 dark:bg-neutral-950 dark:text-neutral-300">
      {children}
    </pre>
  );
}

function StepBody({ step }: { step: TraceStep }) {
  const s = step as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (step.kind) {
    case "request":
      return (
        <p>
          Modelo: <strong>{s.provider?.model ?? "-"}</strong> ({SOURCE_LABEL[s.provider?.source] ?? s.provider?.source})
          {s.provider?.fallback_model && <> · reserva {s.provider.fallback_model}</>}
          {s.hourly_limit?.enforced && (
            <>
              {" "}
              · {s.hourly_limit.used_last_hour} de {s.hourly_limit.max} perguntas nesta hora
            </>
          )}
        </p>
      );
    case "context":
      if (s.base_url !== undefined) {
        // connection test
        return (
          <p>
            {s.provider?.provider} · <strong>{s.provider?.model}</strong> em <code className="text-[11px]">{s.base_url}</code>
            {" · "}
            {s.has_api_key ? "com chave" : "sem chave"} · limite de {s.timeout_seconds} s
          </p>
        );
      }
      return (
        <>
          <p>
            {s.history_messages} mensagens anteriores · prompt de sistema com {s.system_prompt_chars} caracteres ·{" "}
            {s.tools_offered?.length} consultas disponíveis · até {s.max_rounds} rodadas
          </p>
          <Masked redacted={s.redacted} />
          {s.system_prompt && (
            <Detail label="Prompt de sistema enviado">
              <Code>{s.system_prompt}</Code>
            </Detail>
          )}
          {s.history?.length > 0 && (
            <Detail label={`Histórico enviado (${s.history.length} mensagens)`}>
              <Code>
                {s.history
                  .map((m: { role: string; content: string }) => `[${m.role === "user" ? "usuário" : "assistente"}] ${m.content}`)
                  .join("\n\n")}
              </Code>
            </Detail>
          )}
        </>
      );
    case "llm":
      return (
        <>
          {s.outcome === "error" ? (
            <p className="text-red-600 dark:text-red-400">O provedor não respondeu.</p>
          ) : (
            <p>
              <strong>{s.model}</strong>
              {s.messages_sent !== undefined && <> · {s.messages_sent} mensagens enviadas</>}
              {s.usage && (
                <>
                  {" "}
                  · {s.usage.prompt_tokens ?? "?"} tokens de entrada, {s.usage.completion_tokens ?? "?"} de saída
                </>
              )}
              <br />
              {s.outcome === "tool_calls"
                ? `Pediu: ${s.requested_tools.map((t: { name: string; arguments: unknown }) => `${t.name} (${args(t.arguments)})`).join("; ")}`
                : "Escreveu a resposta."}
              {s.finish_reason === "length" && (
                <span className="text-amber-700 dark:text-amber-400"> · cortada no limite de tamanho</span>
              )}
            </p>
          )}
          {s.attempts?.length > 0 && (s.attempts.length > 1 || s.attempts[0].outcome !== "ok") && (
            <ul className="mt-1 list-disc pl-4">
              {s.attempts.map((a: { model: string; outcome: string; status: number | null; ms: number; detail?: string | null }, i: number) => (
                <li key={i}>
                  Tentativa {i + 1}: {a.model} → {ATTEMPT_LABEL[a.outcome] ?? a.outcome}
                  {a.status ? ` (HTTP ${a.status})` : ""} em {seconds(a.ms)}
                  {a.detail && <Code>{a.detail}</Code>}
                </li>
              ))}
            </ul>
          )}
          {s.reasoning && (
            <Detail label="Raciocínio do modelo">
              <Code>{s.reasoning}</Code>
            </Detail>
          )}
          {(s.content ?? s.content_preview) && (
            <Detail label={s.outcome === "tool_calls" ? "Texto que o modelo escreveu junto" : "Texto devolvido pelo modelo"}>
              <Code>{s.content ?? s.content_preview}</Code>
            </Detail>
          )}
        </>
      );
    case "tool":
      return (
        <>
          <p>
            <code className="text-[11px]">{s.name}</code> ({args(s.arguments)})
            {s.ok ? "" : <span className="text-red-600 dark:text-red-400"> · erro: {s.error}</span>}
          </p>
          <Masked redacted={s.redacted} />
          {s.ignored_arguments?.length > 0 && (
            <p className="text-amber-700 dark:text-amber-400">
              Argumentos ignorados (não fazem parte da consulta): {s.ignored_arguments.join(", ")}
            </p>
          )}
          {s.result && (
            <Detail label={`Dados devolvidos ao modelo (${s.result_chars} caracteres${s.truncated_for_model ? ", cortados" : ""})`}>
              <Code>{prettyJson(s.result)}</Code>
            </Detail>
          )}
        </>
      );
    case "grounding":
      return s.checked === 0 ? (
        <p>Nenhum valor em R$ na resposta.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {s.amounts.map((a: { amount: string; verified: boolean }) => (
            <li
              key={a.amount}
              className={`rounded-full px-2 py-0.5 ${
                a.verified
                  ? "bg-cartuga-50 text-cartuga-800 dark:bg-cartuga-900/30 dark:text-cartuga-200"
                  : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
              }`}
            >
              {a.verified ? "✓" : "⚠"} {a.amount}
            </li>
          ))}
        </ul>
      );
    case "caution":
      return <p>{s.applied ? `Aplicado por causa de: ${s.because.join(", ")}.` : "Não necessário (nenhuma simulação)."}</p>;
    case "answer":
      return (
        <p>
          {s.answer_chars} caracteres · {s.sources} fonte{s.sources === 1 ? "" : "s"}
          {s.fallback && " · o modelo não chegou a uma resposta"}
        </p>
      );
    case "error":
      return (
        <>
          <p className="text-red-600 dark:text-red-400">{s.message}</p>
          {s.exception && <Code>{s.exception}</Code>}
        </>
      );
    default:
      return null;
  }
}

/** How this answer was produced, step by step - inside "Raciocínio" in the chat. */
export function TraceView({ trace }: { trace: ChatTrace }) {
  const [copied, setCopied] = useState(false);
  const t = trace.totals;

  async function copyId() {
    try {
      await navigator.clipboard.writeText(trace.trace_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable - the id is visible anyway
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-[var(--color-surface)] p-3 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          <span>{seconds(trace.duration_ms)} no total</span>
          <span>{t.llm_calls} chamada{t.llm_calls === 1 ? "" : "s"} ao modelo</span>
          <span>{t.tool_calls} consulta{t.tool_calls === 1 ? "" : "s"}</span>
          {t.prompt_tokens + t.completion_tokens > 0 && (
            <span>{(t.prompt_tokens + t.completion_tokens).toLocaleString("pt-BR")} tokens</span>
          )}
          <button
            type="button"
            onClick={copyId}
            title="Copiar o identificador para procurar nos logs do servidor"
            className="ml-auto rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10.5px] text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            {copied ? "copiado!" : `rastreio ${trace.trace_id}`}
          </button>
        </div>
        <ol className="relative flex flex-col gap-3 border-l border-neutral-200 pl-4 dark:border-neutral-700">
          {trace.steps.map((step) => (
            <li key={step.n} className="relative">
              <span className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ${KIND_STYLE[step.kind] ?? "bg-neutral-400"}`} />
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-neutral-700 dark:text-neutral-200">
                  {step.n}. {step.title}
                  {"ms" in step && typeof step.ms === "number" && (
                    <span className="font-normal text-neutral-400"> · {seconds(step.ms)}</span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-neutral-400">+{seconds(step.at_ms)}</span>
              </div>
              <div className="mt-0.5 text-[11px] leading-snug text-neutral-600 dark:text-neutral-300">
                <StepBody step={step} />
              </div>
            </li>
          ))}
        </ol>
    </div>
  );
}
