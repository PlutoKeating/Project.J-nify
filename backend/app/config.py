"""Application settings, fully driven by the environment / .env file.

The backend is deployed independently on a cloud server and must expose a
single unique port that operators can fully control through `.env`, so that a
later intranet-penetration layer can be mounted on top to a production URL.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration read from `.env` (see `.env.example`)."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- App identity ---
    APP_NAME: str = "J-nify API"
    APP_ENV: str = "development"
    APP_VERSION: str = "0.1.0"

    # --- Unique network port, fully controlled via .env ---
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000

    # --- Data / cache ---
    DATABASE_URL: str = "sqlite:///./data/jnify.db"
    SESSION_TTL_SECONDS: int = 3600

    # --- Security / privacy ---
    CORS_ORIGINS: str = "*"
    RATE_LIMIT_PER_MINUTE: int = 120

    # --- Observability ---
    LOG_LEVEL: str = "info"

    # --- LLM gateway (stub / degradable; not wired to a real provider yet) ---
    LLM_API_BASE: str = ""
    LLM_API_KEY: str = ""
    LLM_MODEL: str = "template-fallback"

    # --- Guardrails defaults (SPEC §3.5 / §9.4) ---
    QUIET_HOURS_START: str = "23:30"
    QUIET_HOURS_END: str = "08:30"
    MAX_NUDGE_BUDGET: int = 3


settings = Settings()
