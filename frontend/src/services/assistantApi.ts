import { apiClient } from "./api";

export interface AssistantStatus {
  enabled: boolean;
  reason: string | null;
  /** "user" = their own key/model, "system" = server default, "none" = unavailable. */
  source: "user" | "system" | "none";
  provider: string;
  model: string;
  history_days: number;
  /** Null when on the user's own key - the hourly limit only guards the shared quota. */
  max_messages_per_hour: number | null;
  remaining_this_hour: number | null;
}

export interface ProviderOption {
  key: string;
  label: string;
  default_model: string;
  models: string[];
  needs_key: boolean;
  custom_url: boolean;
  key_url: string | null;
}

export interface AssistantSettings {
  /** "system" = use the server default. */
  provider: string;
  model: string | null;
  base_url: string | null;
  has_api_key: boolean;
  /** Only the last characters - the key itself is never sent back. */
  api_key_hint: string | null;
  system_default: { available: boolean; provider: string; model: string };
  providers: ProviderOption[];
}

export interface AssistantSettingsInput {
  provider: string;
  model?: string | null;
  base_url?: string | null;
  /** Omitted/undefined = keep the saved key; "" = remove it. */
  api_key?: string;
}

export interface ChatSource {
  tool: string;
  label: string;
}

export interface ChatFlags {
  /** Decision-support answer (e.g. a purchase simulation) - always shown with the
   * fixed caution notice. */
  caution: boolean;
  /** R$ amounts in the answer that weren't found in the data the assistant consulted. */
  unverified_amounts: string[];
}

/** One stage of the assistant pipeline - fields vary by `kind` (see backend trace.py). */
export interface TraceStep {
  n: number;
  kind: "request" | "context" | "llm" | "tool" | "grounding" | "caution" | "answer" | "error";
  title: string;
  at_ms: number;
  ms?: number;
  [field: string]: unknown;
}

export interface ChatTrace {
  trace_id: string;
  status: "ok" | "error";
  started_at: string;
  duration_ms: number;
  totals: {
    llm_calls: number;
    provider_attempts: number;
    tool_calls: number;
    prompt_tokens: number;
    completion_tokens: number;
  };
  steps: TraceStep[];
}

export interface ChatMessage {
  id: number;
  role: "USER" | "ASSISTANT";
  content: string;
  sources: ChatSource[] | null;
  flags: ChatFlags | null;
  /** How the answer was produced, step by step (assistant messages only). */
  trace?: ChatTrace | null;
  created_at: string;
}

export interface ChatConversation {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatConversationDetail extends ChatConversation {
  messages: ChatMessage[];
}

export async function getAssistantStatus(): Promise<AssistantStatus> {
  return (await apiClient.get<AssistantStatus>("/assistant/status")).data;
}

export async function listConversations(): Promise<ChatConversation[]> {
  return (await apiClient.get<ChatConversation[]>("/assistant/conversations")).data;
}

export async function createConversation(): Promise<ChatConversation> {
  return (await apiClient.post<ChatConversation>("/assistant/conversations")).data;
}

export async function getConversation(id: number): Promise<ChatConversationDetail> {
  return (await apiClient.get<ChatConversationDetail>(`/assistant/conversations/${id}`)).data;
}

export async function deleteConversation(id: number): Promise<void> {
  await apiClient.delete(`/assistant/conversations/${id}`);
}

export async function deleteAllConversations(): Promise<void> {
  await apiClient.delete("/assistant/conversations");
}

export async function sendMessage(
  conversationId: number,
  content: string
): Promise<{ message: ChatMessage; conversation: ChatConversation }> {
  return (await apiClient.post(`/assistant/conversations/${conversationId}/messages`, { content })).data;
}

export async function getAssistantSettings(): Promise<AssistantSettings> {
  return (await apiClient.get<AssistantSettings>("/assistant/settings")).data;
}

export async function saveAssistantSettings(input: AssistantSettingsInput): Promise<AssistantSettings> {
  return (await apiClient.put<AssistantSettings>("/assistant/settings", input)).data;
}

export async function testAssistantSettings(
  input: AssistantSettingsInput
): Promise<{ ok: boolean; message: string; model: string | null }> {
  return (await apiClient.post("/assistant/settings/test", input)).data;
}

// ---- admin: Logs do Assistente ------------------------------------------------------------

export interface AssistantLog {
  id: number;
  trace_id: string;
  user: { id: number; name: string; email: string };
  conversation_id: number | null;
  kind: "chat" | "connection_test";
  status: "ok" | "error";
  provider: string | null;
  model: string | null;
  question: string | null;
  answer: string | null;
  error: string | null;
  duration_ms: number;
  llm_calls: number;
  tool_calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  created_at: string;
}

export interface AssistantLogDetail extends AssistantLog {
  /** Complete, including the system prompt sent to the model. */
  trace: ChatTrace;
}

export interface AssistantLogPage {
  items: AssistantLog[];
  total: number;
  stats: {
    total: number;
    errors: number;
    avg_duration_ms: number;
    max_duration_ms: number;
    prompt_tokens: number;
    completion_tokens: number;
    tool_calls: number;
  };
  retention_days: number;
}

export interface AssistantLogFilters {
  status?: "ok" | "error";
  kind?: "chat" | "connection_test";
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listAssistantLogs(filters: AssistantLogFilters): Promise<AssistantLogPage> {
  const { data } = await apiClient.get<AssistantLogPage>("/admin/assistant/logs", { params: filters });
  return data;
}

export async function getAssistantLog(id: number): Promise<AssistantLogDetail> {
  const { data } = await apiClient.get<AssistantLogDetail>(`/admin/assistant/logs/${id}`);
  return data;
}

export async function deleteAssistantLogs(): Promise<void> {
  await apiClient.delete("/admin/assistant/logs");
}
