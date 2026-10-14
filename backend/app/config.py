import secrets
from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

MIN_SECRET_LENGTH = 32
# Placeholders that ship in public files (.env.example, old defaults): anyone who reads
# the repository knows them, so a server signing tokens with one is open to forged
# ADMIN tokens. Rejected like a missing value.
PUBLIC_PLACEHOLDER_SECRETS = {"troque_por_uma_string_aleatoria_longa", "dev-secret-change-me", "change_me", "changeme", "secret"}
# The public demo account's password (README) - fine for a local demo, a warning
# anywhere else (see main.py).
PUBLIC_DEMO_PASSWORD = "Cartuga@Demo2026"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "mysql+pymysql://cartuga:cartuga@mysql:3306/cartuga"

    # No fallback default on purpose: a JWT secret with a hardcoded default would be a
    # known, public value the moment this code is - startup must fail loudly instead of
    # silently signing tokens with a guessable key if JWT_SECRET is ever left unset.
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    cors_origins: str = "http://localhost:5173"
    cookie_secure: bool = True

    # Public demo account (documented in the README) - override via env in any
    # environment that isn't a local demo.
    initial_admin_name: str = "Conta Demo"
    initial_admin_email: str = "demo@cartuga.dev"
    initial_admin_password: str = "Cartuga@Demo2026"

    exchange_rate_usd: float = 0.19
    exchange_rate_eur: float = 0.17

    db_backup_dir: str = "/app/backups"
    mysqldump_path: str = "mysqldump"
    mysql_restore_path: str = "mysql"

    # Explicit connection params for mysqldump/mysql subprocess calls (the import/export
    # backup pipeline shells out to the real client tools rather than parsing DATABASE_URL).
    mysql_host: str = "mysql"
    mysql_port: int = 3306
    mysql_user: str = "cartuga"
    mysql_password: str = "cartuga"
    mysql_database: str = "cartuga"

    # ---- Assistente Cartuga (chatbot) - see docs/assistente.md ----
    # "groq" (free tier, default), "ollama" (local), "openai_compatible" (any other
    # OpenAI-style /chat/completions endpoint) or "disabled".
    assistant_provider: str = "groq"
    assistant_api_key: str = ""
    # Empty = the provider's default (see app/assistant/llm.py).
    assistant_base_url: str = ""
    assistant_model: str = ""
    assistant_fallback_model: str = ""
    assistant_max_messages_per_hour: int = 30
    assistant_history_days: int = 7
    assistant_timeout_seconds: int = 60
    # Where the Ollama server is, for anyone using provider "ollama" (server default or
    # a user's own choice). The compose service by default; a native Ollama on the
    # Docker host is http://host.docker.internal:11434/v1.
    assistant_ollama_url: str = "http://ollama:11434/v1"
    # Encrypts users' own API keys at rest; empty = derived from JWT_SECRET.
    assistant_encryption_key: str = ""
    # Pipeline trace in the logs: "summary" (steps, timings, tokens, tools - no user
    # content), "full" (everything, for debugging) or "off". See assistant/trace.py.
    assistant_trace_log: str = "summary"
    # How that trace is printed: "text" (readable, live, step by step) or "json" (one
    # line per step, for log tools). See assistant/trace_text.py.
    assistant_trace_format: str = "text"
    # How long the complete per-turn logs (Gerenciamento → Logs do Assistente) are
    # kept; 0 = not stored at all. See assistant/audit.py.
    assistant_log_days: int = 30

    @field_validator("jwt_secret", "assistant_encryption_key")
    @classmethod
    def secret_must_be_private_and_long(cls, value: str, info) -> str:
        if info.field_name == "assistant_encryption_key" and value == "":
            return value  # optional: derived from JWT_SECRET
        if value.strip().lower() in PUBLIC_PLACEHOLDER_SECRETS or len(value) < MIN_SECRET_LENGTH:
            raise ValueError(
                f"{info.field_name.upper()} ausente, curto (mínimo {MIN_SECRET_LENGTH} caracteres) ou igual a um "
                "valor público de exemplo - com ele qualquer pessoa poderia forjar sessões. Defina no .env um "
                f"valor aleatório, por exemplo: {info.field_name.upper()}={secrets.token_urlsafe(48)}"
            )
        return value

    @property
    def is_local(self) -> bool:
        """Every allowed origin is this machine - a local demo, not a deployment."""
        return all(o.split("://")[-1].split(":")[0] in ("localhost", "127.0.0.1") for o in self.cors_origins_list)

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
