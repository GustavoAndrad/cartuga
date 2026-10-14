"""Provider-agnostic LLM client for the Assistente Cartuga.

Every supported provider speaks the OpenAI-style `/chat/completions` API with `tools`
(function calling), so a single small httpx client covers all of them - no SDK
dependency, and switching provider is just configuration. Which provider/model/key a
given user gets is decided in providers.py.
"""

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Protocol

import httpx

from app.assistant.providers import ProviderConfig

logger = logging.getLogger("cartuga.assistant")

# Answers are short by design (and every token counts against the free tier's
# tokens-per-minute budget).
MAX_OUTPUT_TOKENS = 900
TEMPERATURE = 0.2


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict
    # Raw arguments string, echoed back to the provider verbatim in the next request.
    raw_arguments: str = "{}"


@dataclass
class Attempt:
    """One HTTP request to the provider - kept for the pipeline trace."""

    model: str
    # "ok", "rate_limited", "auth_error", "model_not_found", "out_of_memory",
    # "provider_error", "timeout" or "unreachable"
    outcome: str
    status: int | None
    ms: int
    # What actually went wrong, technically (exception, provider's error body) - for
    # the logs; the user gets the friendly LLMError message instead.
    detail: str | None = None


@dataclass
class LLMReply:
    content: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    model: str = ""
    # {"prompt_tokens", "completion_tokens", "total_tokens"} when the provider reports it.
    usage: dict | None = None
    # The model's own reasoning text, when the provider returns it (e.g. gpt-oss on Groq).
    reasoning: str | None = None
    # "stop", "tool_calls", "length" (cut off at MAX_OUTPUT_TOKENS)...
    finish_reason: str | None = None
    attempts: list[Attempt] = field(default_factory=list)


class LLMError(Exception):
    """A failure to show the user as-is (already in Portuguese)."""

    def __init__(self, user_message: str, attempts: list[Attempt] | None = None):
        super().__init__(user_message)
        self.user_message = user_message
        self.attempts = attempts or []


class LLMClient(Protocol):
    model: str

    def chat(self, messages: list[dict], tools: list[dict]) -> LLMReply: ...


class OpenAICompatibleClient:
    def __init__(self, base_url: str, api_key: str, models: list[str], timeout: float, provider: str = ""):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.models = [m for m in models if m]
        self.model = self.models[0]
        self.timeout = timeout
        self.provider = provider

    def _request(self, model: str, messages: list[dict], tools: list[dict]) -> httpx.Response:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        payload = {"model": model, "messages": messages, "temperature": TEMPERATURE, "max_tokens": MAX_OUTPUT_TOKENS}
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
        if self.provider == "ollama":
            # Local reasoning models (qwen3...) "think" by default: on a CPU that's minutes
            # per call, and it can eat the whole MAX_OUTPUT_TOKENS before any answer.
            payload["reasoning_effort"] = "none"
        return httpx.post(f"{self.base_url}/chat/completions", json=payload, headers=headers, timeout=self.timeout)

    def chat(self, messages: list[dict], tools: list[dict]) -> LLMReply:
        last_error = "O assistente não respondeu. Tente de novo em instantes."
        attempts: list[Attempt] = []
        ollama = self.provider == "ollama"
        for model in self.models:
            started = time.perf_counter()
            elapsed = lambda: int((time.perf_counter() - started) * 1000)  # noqa: E731
            try:
                response = self._request(model, messages, tools)
            except httpx.TimeoutException as exc:
                attempts.append(Attempt(model, "timeout", None, elapsed(), f"{type(exc).__name__} após {self.timeout:g}s"))
                last_error = "O assistente demorou demais para responder. Tente de novo."
                if ollama:
                    last_error += (
                        " Modelos locais sem GPU são lentos (e o primeiro uso ainda carrega o modelo na memória):"
                        " experimente um modelo menor ou aumente ASSISTANT_TIMEOUT_SECONDS."
                    )
                continue
            except httpx.HTTPError as exc:
                logger.warning("assistant provider unreachable at %s: %s", self.base_url, exc)
                attempts.append(Attempt(model, "unreachable", None, elapsed(), f"{type(exc).__name__}: {exc} ({self.base_url})"))
                last_error = "Não consegui falar com o provedor do assistente agora. Tente de novo em instantes."
                if ollama:
                    last_error = (
                        f"Não consegui conectar ao Ollama em {self.base_url}. Verifique se ele está rodando "
                        "(docker compose --profile ollama up -d) ou ajuste ASSISTANT_OLLAMA_URL."
                    )
                continue

            body = response.text[:500]
            if response.status_code == 429:
                attempts.append(Attempt(model, "rate_limited", 429, elapsed(), body))
                last_error = (
                    "O limite gratuito do provedor do assistente foi atingido por agora. "
                    "Espere um minuto e tente de novo."
                )
                continue  # the fallback model has its own, separate quota
            if response.status_code in (401, 403):
                attempts.append(Attempt(model, "auth_error", response.status_code, elapsed(), body))
                raise LLMError("A chave de API do assistente é inválida ou não tem acesso a este modelo.", attempts)
            if response.status_code == 404 and "model" in body.lower():
                attempts.append(Attempt(model, "model_not_found", 404, elapsed(), body))
                last_error = f"O modelo {model} não existe no provedor do assistente."
                if ollama:
                    last_error = f"O modelo {model} ainda não foi baixado no Ollama. Baixe com: ollama pull {model}"
                continue
            if response.status_code >= 500 and "memory" in body.lower():
                attempts.append(Attempt(model, "out_of_memory", response.status_code, elapsed(), body))
                last_error = f"O modelo {model} precisa de mais memória do que o servidor tem livre. Escolha um modelo menor."
                continue
            if response.status_code >= 400:
                # 400 here is usually a malformed tool call from the model
                # ("tool_use_failed") - worth one more try on the fallback model.
                logger.warning("assistant provider error %s: %s", response.status_code, body)
                attempts.append(Attempt(model, "provider_error", response.status_code, elapsed(), body))
                last_error = "O assistente se confundiu ao montar a resposta. Tente reformular a pergunta."
                continue

            attempts.append(Attempt(model, "ok", response.status_code, elapsed()))
            reply = self._parse(response.json(), model)
            reply.attempts = attempts
            return reply

        raise LLMError(last_error, attempts)

    @staticmethod
    def _parse(body: dict, model: str) -> LLMReply:
        choice = body["choices"][0]
        message = choice["message"]
        calls = []
        for raw in message.get("tool_calls") or []:
            raw_args = raw["function"].get("arguments") or "{}"
            try:
                arguments = json.loads(raw_args)
                if not isinstance(arguments, dict):
                    arguments = {}
            except json.JSONDecodeError:
                arguments = {}
            calls.append(ToolCall(id=raw.get("id", ""), name=raw["function"]["name"], arguments=arguments, raw_arguments=raw_args))
        usage = body.get("usage")
        return LLMReply(
            content=message.get("content") or "",
            tool_calls=calls,
            model=model,
            usage={k: usage.get(k) for k in ("prompt_tokens", "completion_tokens", "total_tokens")} if usage else None,
            reasoning=message.get("reasoning") or message.get("reasoning_content") or None,
            finish_reason=choice.get("finish_reason"),
        )


def build_client(config: ProviderConfig, timeout: float) -> OpenAICompatibleClient:
    return OpenAICompatibleClient(
        base_url=config.base_url,
        api_key=config.api_key,
        models=[config.model, config.fallback_model],
        timeout=timeout,
        provider=config.provider,
    )
