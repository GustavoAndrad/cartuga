import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { useToast } from "../../hooks/useToast";
import { extractErrorMessage } from "../../services/api";
import {
  getAssistantSettings,
  saveAssistantSettings,
  testAssistantSettings,
  type AssistantSettingsInput,
} from "../../services/assistantApi";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { PasswordInput } from "../PasswordInput";
import { Spinner } from "../Spinner";
import { BoltIcon, CheckSmallIcon, CpuIcon, LinkIcon, LockIcon, ServerIcon, WarningIcon } from "./icons";

const SYSTEM = "system";
const CUSTOM_MODEL = "__custom__";
// Providers outside this server - saving one asks for an explicit confirmation.
const EXTERNAL = new Set(["groq", "openai_compatible"]);

const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-cartuga-500 focus:outline-none focus:ring-2 focus:ring-cartuga-500/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50";
const labelClass = "mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300";
const stepLabel = "mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400";

const PROVIDER_META: Record<string, { icon: ReactNode; description: string; badges: string[] }> = {
  [SYSTEM]: {
    icon: <ServerIcon className="h-5 w-5" />,
    description: "Usa o que o administrador configurou. Sem chave para cadastrar.",
    badges: [],
  },
  groq: {
    icon: <BoltIcon className="h-5 w-5" />,
    description: "Rápido e gratuito, com a sua chave e a sua cota.",
    badges: ["Recomendado", "Gratuito"],
  },
  ollama: {
    icon: <CpuIcon className="h-5 w-5" />,
    description: "Modelo rodando no próprio servidor. Nada sai da máquina.",
    badges: ["Privado"],
  },
  openai_compatible: {
    icon: <LinkIcon className="h-5 w-5" />,
    description: "Qualquer endpoint HTTPS no formato da API da OpenAI.",
    badges: ["Avançado"],
  },
};

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cartuga-600 text-[11px] font-semibold text-white dark:bg-cartuga-500">
      {n}
    </span>
  );
}

/** Perfil → Assistente: which model the user's assistant uses, with their own key. */
export function AssistantSettingsForm() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const settingsQuery = useQuery({ queryKey: ["assistant", "settings"], queryFn: getAssistantSettings });
  const settings = settingsQuery.data;

  const [provider, setProvider] = useState(SYSTEM);
  const [model, setModel] = useState("");
  const [customModel, setCustomModel] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  // undefined = keep the saved key; "" = remove it; text = replace it.
  const [apiKey, setApiKey] = useState<string | undefined>(undefined);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [confirmExternal, setConfirmExternal] = useState(false);

  useEffect(() => {
    if (!settings) return;
    const saved = settings.providers.find((p) => p.key === settings.provider);
    setProvider(settings.provider);
    setModel(settings.model ?? "");
    setCustomModel(!!settings.model && !!saved && !saved.models.includes(settings.model));
    setBaseUrl(settings.base_url ?? "");
    setApiKey(undefined);
    setTestResult(null);
  }, [settings]);

  const option = settings?.providers.find((p) => p.key === provider);
  const savedKeyApplies = !!settings?.has_api_key && settings.provider === provider;
  const dirty =
    !!settings &&
    (provider !== settings.provider ||
      (model || "") !== (settings.model ?? "") ||
      (baseUrl || "") !== (settings.base_url ?? "") ||
      apiKey !== undefined);

  function payload(): AssistantSettingsInput {
    if (provider === SYSTEM) return { provider };
    return {
      provider,
      model: model.trim() || null,
      base_url: option?.custom_url ? baseUrl.trim() : null,
      // A saved key only travels with its own provider.
      api_key: apiKey !== undefined ? apiKey : savedKeyApplies ? undefined : "",
    };
  }

  const saveMutation = useMutation({
    mutationFn: () => saveAssistantSettings(payload()),
    onSettled: () => setConfirmExternal(false),
    onSuccess: (saved) => {
      queryClient.setQueryData(["assistant", "settings"], saved);
      queryClient.invalidateQueries({ queryKey: ["assistant", "status"] });
      showToast("Configuração do assistente salva.", "success");
    },
    onError: (err) => showToast(extractErrorMessage(err, "Não foi possível salvar."), "error"),
  });
  const testMutation = useMutation({
    mutationFn: () => testAssistantSettings(payload()),
    onMutate: () => setTestResult(null),
    onSuccess: (result) =>
      setTestResult({ ok: result.ok, message: result.ok ? `Conexão funcionando · ${result.model}` : result.message }),
    onError: (err) => setTestResult({ ok: false, message: extractErrorMessage(err, "Não foi possível testar.") }),
  });

  // Anything that changes where the data goes (provider, key, URL) needs an explicit
  // "yes" when the destination is outside this server.
  const needsExternalConfirmation =
    EXTERNAL.has(provider) &&
    (provider !== settings?.provider || apiKey !== undefined || (baseUrl || "") !== (settings?.base_url ?? ""));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (needsExternalConfirmation) setConfirmExternal(true);
    else saveMutation.mutate();
  }

  function choose(key: string) {
    setProvider(key);
    setTestResult(null);
    if (key !== settings?.provider) {
      setModel("");
      setCustomModel(false);
      setBaseUrl("");
    } else if (settings) {
      setModel(settings.model ?? "");
      setBaseUrl(settings.base_url ?? "");
    }
  }

  if (settingsQuery.isLoading) return <Spinner label="Carregando..." />;
  if (!settings) return null;

  const choices = [
    { key: SYSTEM, label: "Padrão do servidor" },
    ...settings.providers.map((p) => ({ key: p.key, label: p.label })),
  ];
  const showModelSelect = !!option && option.models.length > 0 && !customModel;

  return (
    <form
      onSubmit={handleSubmit}
      className="overflow-hidden rounded-xl border border-neutral-300 bg-[var(--color-surface)] dark:border-neutral-800"
    >
      <div className="flex flex-col gap-6 p-5">
        <fieldset>
          <legend className={stepLabel}>
            <StepNumber n={1} />
            Provedor
          </legend>
          <div role="radiogroup" aria-label="Provedor do assistente" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {choices.map((c) => {
              const meta = PROVIDER_META[c.key];
              const selected = provider === c.key;
              const detail =
                c.key === SYSTEM
                  ? settings.system_default.available
                    ? `Hoje: ${settings.system_default.provider} · ${settings.system_default.model}`
                    : "Não há padrão configurado neste servidor."
                  : meta?.description;
              return (
                <button
                  key={c.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => choose(c.key)}
                  className={`relative flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all ${
                    selected
                      ? "border-cartuga-500 bg-cartuga-50/70 ring-2 ring-cartuga-500/20 dark:border-cartuga-600 dark:bg-cartuga-900/20"
                      : "border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:border-neutral-700 dark:hover:bg-neutral-800/40"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      selected
                        ? "bg-cartuga-600 text-white dark:bg-cartuga-500"
                        : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                    }`}
                  >
                    {meta?.icon}
                  </span>
                  <span className="min-w-0 flex-1 pr-5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{c.label}</span>
                      {meta?.badges.map((b) => (
                        <span
                          key={b}
                          className="rounded-full bg-cartuga-100 px-1.5 py-px text-[10px] font-semibold text-cartuga-800 dark:bg-cartuga-900/50 dark:text-cartuga-200"
                        >
                          {b}
                        </span>
                      ))}
                    </span>
                    <span className="mt-0.5 block text-xs text-neutral-500 dark:text-neutral-400">{detail}</span>
                  </span>
                  {selected && (
                    <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-cartuga-600 text-white dark:bg-cartuga-500">
                      <CheckSmallIcon className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>

        {option && (
          <fieldset>
            <legend className={stepLabel}>
              <StepNumber n={2} />
              Detalhes
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="assistant-model" className={labelClass}>
                  Modelo
                </label>
                {showModelSelect ? (
                  <select
                    id="assistant-model"
                    value={model}
                    onChange={(e) => {
                      if (e.target.value === CUSTOM_MODEL) {
                        setCustomModel(true);
                        setModel("");
                      } else setModel(e.target.value);
                    }}
                    className={inputClass}
                  >
                    <option value="">Padrão ({option.default_model})</option>
                    {option.models
                      .filter((m) => m !== option.default_model)
                      .map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    <option value={CUSTOM_MODEL}>Outro modelo…</option>
                  </select>
                ) : (
                  <div className="flex gap-2">
                    <input
                      id="assistant-model"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder={option.default_model || "nome-do-modelo"}
                      className={inputClass}
                    />
                    {option.models.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomModel(false);
                          setModel("");
                        }}
                        className="shrink-0 rounded-lg px-2 text-xs font-medium text-cartuga-700 hover:bg-cartuga-50 dark:text-cartuga-300 dark:hover:bg-cartuga-900/30"
                      >
                        Lista
                      </button>
                    )}
                  </div>
                )}
              </div>

              {option.custom_url && (
                <div>
                  <label htmlFor="assistant-base-url" className={labelClass}>
                    URL da API
                  </label>
                  <input
                    id="assistant-base-url"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.exemplo.com/v1"
                    className={inputClass}
                  />
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Só HTTPS e endereços públicos.</p>
                </div>
              )}

              {(option.needs_key || option.custom_url) && (
                <div className={option.custom_url ? "sm:col-span-2" : ""}>
                  <label htmlFor="assistant-api-key" className={labelClass}>
                    Chave de API{" "}
                    {option.custom_url && <span className="font-normal text-neutral-400">(se o serviço exigir)</span>}
                  </label>
                  {savedKeyApplies && apiKey === undefined ? (
                    <div className="flex items-center gap-2.5 rounded-lg border border-cartuga-200 bg-cartuga-50/60 px-3 py-2 dark:border-cartuga-900/60 dark:bg-cartuga-900/20">
                      <LockIcon className="h-4 w-4 shrink-0 text-cartuga-600 dark:text-cartuga-400" />
                      <span className="min-w-0 flex-1 text-sm text-neutral-700 dark:text-neutral-200">
                        Chave salva <span className="font-mono text-xs text-neutral-500">•••• {settings.api_key_hint?.replace("…", "")}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setApiKey("")}
                        className="text-xs font-semibold text-cartuga-700 hover:underline dark:text-cartuga-300"
                      >
                        Trocar
                      </button>
                    </div>
                  ) : (
                    <PasswordInput
                      id="assistant-api-key"
                      value={apiKey ?? ""}
                      onChange={setApiKey}
                      className={inputClass}
                      autoComplete="off"
                      placeholder={option.key === "groq" ? "gsk_..." : ""}
                    />
                  )}
                  {option.key_url && (
                    <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                      Não tem uma?{" "}
                      <a href={option.key_url} target="_blank" rel="noreferrer" className="font-medium text-cartuga-700 hover:underline dark:text-cartuga-300">
                        Gere grátis no Groq
                      </a>{" "}
                      (sem cartão).
                    </p>
                  )}
                </div>
              )}
            </div>
          </fieldset>
        )}

        <div className="flex items-start gap-2.5 rounded-lg bg-neutral-50 px-3.5 py-3 text-xs leading-relaxed text-neutral-600 dark:bg-neutral-800/50 dark:text-neutral-300">
          <LockIcon className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
          <p>
            Sua chave fica <strong>criptografada</strong> no servidor e nunca é exibida de novo. Com um provedor externo, suas
            perguntas e os dados consultados para respondê-las são enviados a ele, com CPF, cartão, e-mail e telefone mascarados antes do envio; com o Ollama, nada sai do servidor.
            {provider === SYSTEM && settings.has_api_key && " Ao voltar para o padrão do servidor, sua chave salva é apagada."}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-neutral-200 bg-neutral-50/70 px-5 py-3 dark:border-neutral-800 dark:bg-neutral-800/30 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1" aria-live="polite">
          {testResult ? (
            <span
              role="status"
              className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                testResult.ok
                  ? "bg-cartuga-100 text-cartuga-800 dark:bg-cartuga-900/50 dark:text-cartuga-200"
                  : "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
              }`}
            >
              {testResult.ok ? <CheckSmallIcon className="h-3.5 w-3.5 shrink-0" /> : <WarningIcon className="h-3.5 w-3.5 shrink-0" />}
              <span className="truncate">{testResult.message}</span>
            </span>
          ) : (
            dirty && <span className="text-xs text-amber-700 dark:text-amber-400">Alterações não salvas</span>
          )}
        </div>
        <div className="flex gap-2 sm:justify-end">
          <Button type="button" variant="secondary" onClick={() => testMutation.mutate()} loading={testMutation.isPending}>
            {testMutation.isPending ? "Testando..." : "Testar conexão"}
          </Button>
          <Button type="submit" loading={saveMutation.isPending} disabled={!dirty || saveMutation.isPending}>
            {saveMutation.isPending ? "Salvando..." : "Salvar configuração"}
          </Button>
        </div>
      </div>

      <Modal
        open={confirmExternal}
        onClose={() => setConfirmExternal(false)}
        title="Usar um provedor externo?"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setConfirmExternal(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando..." : "Entendi, salvar"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 text-sm text-neutral-600 dark:text-neutral-300">
          <p>
            Com <strong className="text-neutral-900 dark:text-neutral-50">{option?.label}</strong>, o assistente passa a
            enviar para um serviço fora deste servidor:
          </p>
          <ul className="flex flex-col gap-2">
            <li className="flex gap-2.5">
              <WarningIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>Suas perguntas e as últimas mensagens da conversa.</span>
            </li>
            <li className="flex gap-2.5">
              <WarningIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>
                Os dados consultados para responder cada pergunta: valores, datas, descrições e fontes dos seus lançamentos.
              </span>
            </li>
          </ul>
          <div className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800/50">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              O que continua protegido
            </p>
            <ul className="flex flex-col gap-1.5 text-[13px]">
              <li className="flex gap-2">
                <LockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cartuga-600 dark:text-cartuga-400" />
                Sua chave fica criptografada aqui e nunca é exibida de novo.
              </li>
              <li className="flex gap-2">
                <CheckSmallIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cartuga-600 dark:text-cartuga-400" />
                Vai só o necessário para cada pergunta, nunca o banco inteiro.
              </li>
              <li className="flex gap-2">
                <CheckSmallIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cartuga-600 dark:text-cartuga-400" />
                O assistente só lê: nada é criado, alterado ou apagado.
              </li>
            </ul>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            O provedor segue os próprios termos de uso e de privacidade, e o uso conta na cota da sua conta nele. Para que
            nada saia do servidor, prefira o Ollama.
          </p>
        </div>
      </Modal>
    </form>
  );
}
