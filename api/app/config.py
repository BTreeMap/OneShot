"""OneShot application-specific settings."""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class OneShotSettings(BaseSettings):
    """Centralized environment-driven settings for OneShot features."""

    model_config = SettingsConfigDict(
        env_prefix="ONESHOT_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    local_upload_dir: Path = Path("./uploads")
    public_domain: str = "localhost:5173"
    token_expiry_hours: int = 48
    max_upload_bytes: int = 5 * 1024 * 1024 * 1024
    allow_passkey_registration_for_e2e: bool = False

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = "no-reply@oneshot.local"
    smtp_use_ssl: bool = False
    smtp_timeout: float = 10.0
