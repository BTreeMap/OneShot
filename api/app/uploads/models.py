"""OneShot upload models."""

from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.rng import new_file_id, new_oneshot_token_id
from h4ckath0n.db.base import Base


class OneShotToken(Base):
    __tablename__ = "oneshot_tokens"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_oneshot_token_id)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by_id: Mapped[str] = mapped_column(ForeignKey("h4ckath0n_users.id"), nullable=False)
    target_email: Mapped[str | None] = mapped_column(String, nullable=True)


class FileMetadata(Base):
    __tablename__ = "file_metadata"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_file_id)
    original_filename: Mapped[str] = mapped_column(String, nullable=False)
    mime_type: Mapped[str] = mapped_column(String, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    token_id: Mapped[str] = mapped_column(
        ForeignKey("oneshot_tokens.id"), unique=True, nullable=False
    )
