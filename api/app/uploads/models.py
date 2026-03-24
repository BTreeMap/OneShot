"""OneShot upload models."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.rng import new_file_id, new_oneshot_token_id
from h4ckath0n.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class OneShotToken(Base):
    __tablename__ = "oneshot_tokens"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_oneshot_token_id)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by_id: Mapped[str] = mapped_column(ForeignKey("h4ckath0n_users.id"), nullable=False)
    target_email: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)


class FileMetadata(Base):
    __tablename__ = "file_metadata"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_file_id)
    original_filename: Mapped[str] = mapped_column(String, nullable=False)
    mime_type: Mapped[str] = mapped_column(String, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    token_id: Mapped[str] = mapped_column(
        ForeignKey("oneshot_tokens.id"), unique=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, server_default=func.now(), nullable=False
    )
