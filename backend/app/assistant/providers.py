"""Which LLM a given user's Assistente talks to.

Resolution: a user's own settings (Perfil → Assistente) win; without them, the
server's default from the environment. An incomplete or invalid user configuration
disables the assistant *with its reason* - it never silently falls back to the server
key, which would spend someone else's quota without the user knowing.
"""

import ipaddress
import re
import socket
from dataclasses import dataclass
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from app.assistant import secrets
from app.config import Settings
from app.models.assistant import AssistantSettings

SYSTEM = "system"

PROVIDERS: dict[str, dict] = {
    "groq": {
        "label": "Groq (plano gratuito)",
        "base_url": "https://api.groq.com/openai/v1",
        "default_model": "openai/gpt-oss-120b",
        "fallback_model": "openai/gpt-oss-20b",
        "needs_key": True,
        "custom_url": False,
        "models": ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"],
        "key_url": "https://console.groq.com/keys",
    },
    "ollama": {
        "label": "Ollama (modelo local do servidor)",
        "base_url": "",  # from ASSISTANT_OLLAMA_URL - see ollama_url()
        "default_model": "qwen3:8b",
        "fallback_model": "",
        "needs_key": False,
        "custom_url": False,
        # Roughly by memory needed: 8b ~6 GB, 4b ~3.5 GB, 1.7b ~2 GB.
        "models": ["qwen3:8b", "qwen3:4b", "qwen3:1.7b", "llama3.2:3b", "gpt-oss:20b"],
        "key_url": None,
    },
    "openai_compatible": {
        "label": "Outra API compatível com a da OpenAI",
        "base_url": "",
        "default_model": "",
        "fallback_model": "",
        "needs_key": False,
        "custom_url": True,
        "models": [],
        "key_url": None,
    },
}

MODEL_PATTERN = re.compile(r"^[A-Za-z0-9._:/@-]{1,120}$")


@dataclass
class ProviderConfig:
    source: str  # "user" or "system"
    provider: str
    base_url: str
    model: str
    fallback_model: str
    api_key: str


@dataclass
class Resolution:
    config: ProviderConfig | None
    reason: str | None
    source: str  # "user", "system" or "none"


class InvalidSettingError(ValueError):
    pass


# ---- validation -----------------------------------------------------------------------


def check_public_https_url(url: str) -> None:
    """A user-supplied endpoint must be HTTPS and resolve only to public addresses -
    otherwise any user could make the server call its own internal services (SSRF:
    the database, the Docker network, cloud metadata endpoints...). Checked when saving
    and again on every use."""
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise InvalidSettingError("A URL precisa começar com https:// e ter um endereço válido.")
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(parsed.hostname, parsed.port or 443)}
    except socket.gaierror:
        raise InvalidSettingError("Não foi possível encontrar esse endereço.")
    for address in addresses:
        if not ipaddress.ip_address(address.split("%")[0]).is_global:
            raise InvalidSettingError("Esse endereço aponta para uma rede interna e não é permitido.")


def check_model(model: str) -> None:
    if not MODEL_PATTERN.match(model):
        raise InvalidSettingError("Nome de modelo inválido.")


# ---- resolution -----------------------------------------------------------------------


def ollama_url(settings: Settings) -> str:
    # ASSISTANT_BASE_URL with ASSISTANT_PROVIDER=ollama was the original way to point
    # at another Ollama - still honored.
    if settings.assistant_provider == "ollama" and settings.assistant_base_url:
        return settings.assistant_base_url
    return settings.assistant_ollama_url


def system_config(settings: Settings) -> tuple[ProviderConfig | None, str | None]:
    provider = settings.assistant_provider
    if provider == "disabled":
        return None, "O assistente está desativado nesta instalação."
    meta = PROVIDERS.get(provider)
    if meta is None:
        return None, f"Provedor do assistente desconhecido: {provider}."
    config = ProviderConfig(
        source="system",
        provider=provider,
        base_url=ollama_url(settings) if provider == "ollama" else settings.assistant_base_url or meta["base_url"],
        model=settings.assistant_model or meta["default_model"],
        fallback_model=settings.assistant_fallback_model or meta["fallback_model"],
        api_key=settings.assistant_api_key,
    )
    if meta["needs_key"] and not config.api_key:
        return None, "O servidor não tem uma chave padrão para o assistente."
    if not config.base_url or not config.model:
        return None, "O servidor não tem um modelo padrão configurado para o assistente."
    return config, None


def user_config(row: AssistantSettings, settings: Settings) -> tuple[ProviderConfig | None, str | None]:
    meta = PROVIDERS.get(row.provider)
    if meta is None:
        return None, "Seu provedor salvo não é mais suportado. Escolha outro em Perfil → Assistente."
    api_key = ""
    if row.api_key_encrypted:
        try:
            api_key = secrets.decrypt(row.api_key_encrypted)
        except secrets.UnreadableSecretError:
            return None, "Sua chave salva não pôde ser lida (a criptografia do servidor mudou). Cadastre-a de novo no Perfil."
    if meta["needs_key"] and not api_key:
        return None, "Falta a sua chave de API. Cadastre em Perfil → Assistente."

    if meta["custom_url"]:
        base_url = row.base_url or ""
        try:
            check_public_https_url(base_url)
        except InvalidSettingError as exc:
            return None, f"A URL configurada no seu perfil não é permitida: {exc}"
    elif row.provider == "ollama":
        base_url = ollama_url(settings)  # whatever the server admin set up
    else:
        base_url = meta["base_url"]

    model = row.model or meta["default_model"]
    if not model:
        return None, "Falta o nome do modelo. Configure em Perfil → Assistente."
    fallback = meta["fallback_model"] if not row.model or row.model == meta["default_model"] else ""
    return ProviderConfig("user", row.provider, base_url, model, fallback, api_key), None


def resolve(db: Session, user_id: int, settings: Settings) -> Resolution:
    row = db.get(AssistantSettings, user_id)
    if row is not None and row.provider != SYSTEM:
        config, reason = user_config(row, settings)
        return Resolution(config, reason, "user")
    config, reason = system_config(settings)
    if config is None:
        return Resolution(
            None, f"{reason} Você pode usar a sua própria chave em Perfil → Assistente.", "none"
        )
    return Resolution(config, None, "system")
