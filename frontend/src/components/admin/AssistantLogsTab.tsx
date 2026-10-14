import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState, type FormEvent } from "react";

import { Button } from "../Button";
import { ConfirmDialog } from "../ConfirmDialog";
import { ErrorState } from "../ErrorState";
import { Spinner } from "../Spinner";
import { TraceView } from "../assistant/TraceView";
import { useToast } from "../../hooks/useToast";
import { extractErrorMessage } from "../../services/api";
import {
  deleteAssistantLogs,
  getAssistantLog,
  listAssistantLogs,
  type AssistantLog,
  type AssistantLogFilters,
} from "../../services/assistantApi";

const PAGE_SIZE = 50;

const cardClass = "rounded-xl border border-neutral-300 bg-[var(--color-surface)] p-3 dark:border-neutral-800";
const inputClass =
  "rounded-lg border border-neutral-300 bg-[var(--color-surface)] px-3 py-2 text-sm text-neutral-800 dark:border-neutral-700 dark:text-neutral-100";

function seconds(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
}

function dateTime(iso: string): string {
  return new Date(iso.endsWith("Z") ? iso : `${iso}Z`).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div className={cardClass}>
      <div className="text-xs text-neutral-500 dark:text-neutral-400">{label}</div>
      <div
        className={`mt-1 text-lg font-semibold ${
          tone === "bad" ? "text-red-600 dark:text-red-400" : "text-neutral-900 dark:text-neutral-50"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: AssistantLog["status"] }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        status === "ok"
          ? "bg-cartuga-50 text-cartuga-800 dark:bg-cartuga-900/30 dark:text-cartuga-200"
          : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
      }`}
    >
      {status === "ok" ? "Sucesso" : "Falha"}
    </span>
  );
}

function Block({ label, children, tone }: { label: string; children: string; tone?: "bad" }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</div>
      <p
        className={`whitespace-pre-wrap break-words rounded-lg p-3 text-sm ${
          tone === "bad"
            ? "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200"
            : "bg-neutral-50 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
        }`}
      >
        {children}
      </p>
    </div>
  );
}

function LogDetail({ id }: { id: number }) {
  const { showToast } = useToast();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["assistant-log", id],
    queryFn: () => getAssistantLog(id),
  });

  if (isLoading) return <Spinner label="Carregando o registro..." />;
  if (isError || !data) return <ErrorState message="Não foi possível carregar o registro." onRetry={() => refetch()} />;

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      showToast("Registro completo copiado (JSON).", "success");
    } catch {
      showToast("Não foi possível copiar.", "error");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
        <span className="font-mono">rastreio {data.trace_id}</span>
        <span>
          {data.provider ?? "-"} · {data.model ?? "-"}
        </span>
        {data.conversation_id && <span>conversa #{data.conversation_id}</span>}
        <button
          type="button"
          onClick={copyJson}
          className="ml-auto rounded bg-neutral-100 px-2 py-1 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
        >
          Copiar JSON completo
        </button>
      </div>
      {data.question && <Block label={data.kind === "chat" ? "Pergunta" : "Prompt de teste"}>{data.question}</Block>}
      {data.answer && <Block label="Resposta">{data.answer}</Block>}
      {data.error && (
        <Block label="Erro" tone="bad">
          {data.error}
        </Block>
      )}
      <TraceView trace={data.trace} />
    </div>
  );
}

/** Gerenciamento → Logs do Assistente: every turn and connection test, complete. */
export function AssistantLogsTab() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [filters, setFilters] = useState<AssistantLogFilters>({});
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const params = { ...filters, limit: PAGE_SIZE, offset: page * PAGE_SIZE };
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["assistant-logs", params],
    queryFn: () => listAssistantLogs(params),
    placeholderData: keepPreviousData,
  });

  const clearMutation = useMutation({
    mutationFn: deleteAssistantLogs,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assistant-logs"] });
      showToast("Logs apagados.", "success");
      setOpenId(null);
    },
    onError: (err) => showToast(extractErrorMessage(err, "Não foi possível apagar os logs."), "error"),
    onSettled: () => setConfirmClear(false),
  });

  function update(next: AssistantLogFilters) {
    setFilters((current) => ({ ...current, ...next }));
    setPage(0);
    setOpenId(null);
  }

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    update({ search: search.trim() || undefined });
  }

  if (isLoading) return <Spinner label="Carregando logs..." />;
  if (isError || !data) return <ErrorState message="Não foi possível carregar os logs." onRetry={() => refetch()} />;

  const s = data.stats;
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Cada pergunta que você fez ao assistente (respondida ou não) e cada teste de conexão seu, completos: prompt
        enviado, chamadas ao modelo, dados consultados, tempos e erros. Guardados por {data.retention_days} dias. Por
        segurança, cada administrador vê apenas os próprios registros, nunca os de outros usuários.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Registros" value={s.total.toLocaleString("pt-BR")} />
        <Stat label="Falhas" value={s.errors.toLocaleString("pt-BR")} tone={s.errors ? "bad" : undefined} />
        <Stat label="Tempo médio" value={seconds(s.avg_duration_ms)} />
        <Stat label="Mais lento" value={seconds(s.max_duration_ms)} />
        <Stat label="Consultas aos dados" value={s.tool_calls.toLocaleString("pt-BR")} />
        <Stat label="Tokens" value={(s.prompt_tokens + s.completion_tokens).toLocaleString("pt-BR")} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Status"
          className={inputClass}
          value={filters.status ?? ""}
          onChange={(e) => update({ status: (e.target.value || undefined) as AssistantLogFilters["status"] })}
        >
          <option value="">Todos os status</option>
          <option value="ok">Sucesso</option>
          <option value="error">Falha</option>
        </select>
        <select
          aria-label="Tipo"
          className={inputClass}
          value={filters.kind ?? ""}
          onChange={(e) => update({ kind: (e.target.value || undefined) as AssistantLogFilters["kind"] })}
        >
          <option value="">Todos os tipos</option>
          <option value="chat">Perguntas</option>
          <option value="connection_test">Testes de conexão</option>
        </select>
        <form onSubmit={submitSearch} className="flex min-w-[220px] flex-1 gap-2">
          <input
            className={`${inputClass} flex-1`}
            placeholder="Buscar no texto ou pelo código de rastreio"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>
        <Button variant="secondary" onClick={() => refetch()} loading={isFetching}>
          Atualizar
        </Button>
        <Button variant="danger" onClick={() => setConfirmClear(true)} disabled={data.total === 0}>
          Apagar logs
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-300 dark:border-neutral-800">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
            <tr>
              <th className="px-3 py-3 font-medium">Quando</th>
              <th className="px-3 py-3 font-medium">Pergunta / erro</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">Modelo</th>
              <th className="px-3 py-3 text-right font-medium">Tempo</th>
              <th className="px-3 py-3 text-right font-medium">Consultas</th>
              <th className="px-3 py-3 text-right font-medium">Tokens</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-300 dark:divide-neutral-800">
            {data.items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-neutral-500 dark:text-neutral-400">
                  Nenhum registro encontrado.
                </td>
              </tr>
            )}
            {data.items.map((log) => (
              <Fragment key={log.id}>
                <tr
                  onClick={() => setOpenId(openId === log.id ? null : log.id)}
                  className={`cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900 ${
                    openId === log.id ? "bg-neutral-50 dark:bg-neutral-900" : ""
                  }`}
                >
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-neutral-600 dark:text-neutral-300">
                    {dateTime(log.created_at)}
                  </td>
                  <td className="max-w-[360px] px-3 py-2">
                    {log.kind === "connection_test" && (
                      <span className="mr-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                        teste de conexão
                      </span>
                    )}
                    <span className="text-neutral-800 dark:text-neutral-100">
                      {log.kind === "chat" ? log.question : ""}
                    </span>
                    {log.error && (
                      <div className="truncate text-xs text-red-600 dark:text-red-400" title={log.error}>
                        {log.error}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={log.status} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-neutral-600 dark:text-neutral-300">
                    {log.model ?? "-"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-neutral-700 dark:text-neutral-200">
                    {seconds(log.duration_ms)}
                  </td>
                  <td className="px-3 py-2 text-right text-neutral-700 dark:text-neutral-200">{log.tool_calls}</td>
                  <td className="px-3 py-2 text-right text-neutral-700 dark:text-neutral-200">
                    {(log.prompt_tokens + log.completion_tokens).toLocaleString("pt-BR")}
                  </td>
                </tr>
                {openId === log.id && (
                  <tr>
                    <td colSpan={7} className="bg-neutral-50/60 px-3 py-4 dark:bg-neutral-900/40">
                      <LogDetail id={log.id} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm text-neutral-600 dark:text-neutral-300">
          <Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Anterior
          </Button>
          <span>
            Página {page + 1} de {pages}
          </span>
          <Button variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
            Próxima
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmClear}
        title="Apagar todos os seus logs do assistente?"
        message="Todos os seus registros serão apagados de forma permanente. Suas conversas não são afetadas."
        confirmLabel="Apagar logs"
        loadingLabel="Apagando..."
        loading={clearMutation.isPending}
        onConfirm={() => clearMutation.mutate()}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
