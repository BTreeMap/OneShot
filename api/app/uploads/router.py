"""OneShot upload API routes."""

from __future__ import annotations

import logging
import smtplib
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from pathlib import Path

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Header,
    HTTPException,
    UploadFile,
    status,
)
from pydantic import BaseModel
from sqlalchemy import desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import FileResponse
from starlette.requests import Request

from app.rng import new_file_id
from app.config import OneShotSettings
from app.uploads.models import FileMetadata, OneShotToken
from h4ckath0n.auth.dependencies import require_admin
from h4ckath0n.auth.models import User

CHUNK_SIZE = 1024 * 1024
SETTINGS = OneShotSettings()

router = APIRouter()
logger = logging.getLogger(__name__)


class CreateOneShotTokenRequest(BaseModel):
    target_email: str | None = None


class CreateOneShotTokenResponse(BaseModel):
    token_id: str
    link: str | None = None
    sent: bool = False


class OneShotUploadResponse(BaseModel):
    file_id: str


class OneShotTokenAuditItem(BaseModel):
    id: str
    target_email: str | None
    is_used: bool
    created_at: datetime
    expires_at: datetime


class OneShotStatsResponse(BaseModel):
    total_files: int
    total_storage_bytes: int
    tokens_issued: int
    tokens_used: int
    active_tokens: int


class FileAuditItem(BaseModel):
    id: str
    original_filename: str
    mime_type: str
    size_bytes: int
    created_at: datetime
    target_email: str | None


async def _db_dep(request: Request):  # type: ignore[no-untyped-def]
    async with request.app.state.async_session_factory() as db:
        yield db


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return parts[1]


def _oneshot_link(token_id: str) -> str:
    return f"https://{SETTINGS.public_domain}/oneshot#token={token_id}"


async def _send_oneshot_email(target_email: str, link: str) -> bool:
    if not SETTINGS.smtp_host:
        logger.warning("OneShot email dispatch skipped: ONESHOT_SMTP_HOST is not configured")
        return False

    message = EmailMessage()
    message["Subject"] = "Secure OneShot Upload Link"
    message["From"] = SETTINGS.smtp_from
    message["To"] = target_email
    message.set_content(
        (
            "You have received a secure, single-use upload link for OneShot.\n\n"
            f"{link}\n\n"
            "This link expires permanently after one successful upload.\n"
            "Do not forward this message to unauthorized recipients.\n"
        )
    )

    try:
        if SETTINGS.smtp_use_ssl:
            smtp_ctx = smtplib.SMTP_SSL(
                SETTINGS.smtp_host,
                SETTINGS.smtp_port,
                timeout=SETTINGS.smtp_timeout,
            )
        else:
            smtp_ctx = smtplib.SMTP(
                SETTINGS.smtp_host,
                SETTINGS.smtp_port,
                timeout=SETTINGS.smtp_timeout,
            )

        with smtp_ctx as smtp:
            if not SETTINGS.smtp_use_ssl:
                code, _ = smtp.starttls()
                if code not in {220, 250}:
                    raise smtplib.SMTPException(
                        f"STARTTLS handshake failed with SMTP code {code}"
                    )
            if SETTINGS.smtp_username and SETTINGS.smtp_password:
                smtp.login(SETTINGS.smtp_username, SETTINGS.smtp_password)
            smtp.send_message(message)
        return True
    except Exception as exc:
        logger.exception(
            "Failed to dispatch OneShot email to %s: %s",
            target_email,
            type(exc).__name__,
        )
        return False


@router.post(
    "/admin/oneshot-tokens",
    response_model=CreateOneShotTokenResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_oneshot_token(
    body: CreateOneShotTokenRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(_db_dep),
    admin_user: User = require_admin(),
) -> CreateOneShotTokenResponse:
    token = OneShotToken(
        created_by_id=admin_user.id,
        target_email=body.target_email,
        expires_at=datetime.now(UTC) + timedelta(hours=SETTINGS.token_expiry_hours),
    )
    db.add(token)
    await db.commit()
    await db.refresh(token)

    link = _oneshot_link(token.id)
    if body.target_email:
        background_tasks.add_task(_send_oneshot_email, body.target_email, link)
        return CreateOneShotTokenResponse(token_id=token.id, sent=True)
    return CreateOneShotTokenResponse(token_id=token.id, link=link)


@router.post("/oneshot/upload", response_model=OneShotUploadResponse)
async def oneshot_upload(
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(_db_dep),
) -> OneShotUploadResponse:
    token_id = _extract_bearer_token(authorization)

    stmt = (
        update(OneShotToken)
        .where(
            OneShotToken.id == token_id,
            OneShotToken.is_used == False,  # noqa: E712
            OneShotToken.expires_at > func.now(),
        )
        .values(is_used=True)
        .returning(OneShotToken.id)
    )
    result = await db.execute(stmt)
    if result.first() is None:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or used token")

    SETTINGS.local_upload_dir.mkdir(parents=True, exist_ok=True)
    file_id = new_file_id()
    storage_path = SETTINGS.local_upload_dir / file_id

    size_bytes = 0
    try:
        with storage_path.open("wb") as out:
            while True:
                chunk = await file.read(CHUNK_SIZE)
                if not chunk:
                    break
                size_bytes += len(chunk)
                if size_bytes > SETTINGS.max_upload_bytes:
                    raise HTTPException(
                        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                        detail="File too large",
                    )
                out.write(chunk)

        db.add(
            FileMetadata(
                id=file_id,
                original_filename=file.filename or "upload.bin",
                mime_type=file.content_type or "application/octet-stream",
                size_bytes=size_bytes,
                token_id=token_id,
            )
        )
        await db.commit()
        return OneShotUploadResponse(file_id=file_id)
    except Exception:
        storage_path.unlink(missing_ok=True)
        await db.rollback()
        raise
    finally:
        await file.close()


@router.get("/admin/oneshot-tokens", response_model=list[OneShotTokenAuditItem])
async def list_oneshot_tokens(
    db: AsyncSession = Depends(_db_dep),
    _admin_user: User = require_admin(),
) -> list[OneShotTokenAuditItem]:
    rows = (
        await db.execute(select(OneShotToken).order_by(desc(OneShotToken.created_at)))
    ).scalars()
    return [
        OneShotTokenAuditItem(
            id=row.id,
            target_email=row.target_email,
            is_used=row.is_used,
            created_at=row.created_at,
            expires_at=row.expires_at,
        )
        for row in rows
    ]


@router.get("/admin/stats", response_model=OneShotStatsResponse)
async def get_oneshot_stats(
    db: AsyncSession = Depends(_db_dep),
    _admin_user: User = require_admin(),
) -> OneShotStatsResponse:
    total_files = (
        await db.execute(select(func.count(FileMetadata.id)))
    ).scalar_one()
    total_storage_bytes = (
        await db.execute(select(func.coalesce(func.sum(FileMetadata.size_bytes), 0)))
    ).scalar_one()
    tokens_issued = (
        await db.execute(select(func.count(OneShotToken.id)))
    ).scalar_one()
    tokens_used = (
        await db.execute(
            select(func.count(OneShotToken.id)).where(OneShotToken.is_used.is_(True))
        )
    ).scalar_one()
    active_tokens = (
        await db.execute(
            select(func.count(OneShotToken.id)).where(
                OneShotToken.is_used.is_(False),
                OneShotToken.expires_at > func.now(),
            )
        )
    ).scalar_one()

    return OneShotStatsResponse(
        total_files=total_files,
        total_storage_bytes=total_storage_bytes,
        tokens_issued=tokens_issued,
        tokens_used=tokens_used,
        active_tokens=active_tokens,
    )


@router.get("/admin/files", response_model=list[FileAuditItem])
async def list_uploaded_files(
    db: AsyncSession = Depends(_db_dep),
    _admin_user: User = require_admin(),
) -> list[FileAuditItem]:
    result = await db.execute(
        select(FileMetadata, OneShotToken.target_email)
        .join(OneShotToken, OneShotToken.id == FileMetadata.token_id)
        .order_by(desc(FileMetadata.created_at))
    )
    return [
        FileAuditItem(
            id=file_row.id,
            original_filename=file_row.original_filename,
            mime_type=file_row.mime_type,
            size_bytes=file_row.size_bytes,
            created_at=file_row.created_at,
            target_email=target_email,
        )
        for file_row, target_email in result.all()
    ]


@router.get("/admin/files/{file_id}/download")
async def download_file(
    file_id: str,
    db: AsyncSession = Depends(_db_dep),
    _admin_user: User = require_admin(),
) -> FileResponse:
    metadata = (
        await db.execute(select(FileMetadata).where(FileMetadata.id == file_id))
    ).scalar_one_or_none()
    if metadata is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    file_path: Path = SETTINGS.local_upload_dir / metadata.id
    if not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    return FileResponse(
        path=file_path,
        media_type=metadata.mime_type,
        filename=metadata.original_filename,
        content_disposition_type="attachment",
    )
