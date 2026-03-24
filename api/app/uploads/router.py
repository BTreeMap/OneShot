"""OneShot upload API routes."""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

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
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession
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
                code, _message = smtp.starttls()
                if code not in {220, 250}:
                    raise smtplib.SMTPException(
                        f"STARTTLS handshake failed with SMTP code {code}"
                    )
            if SETTINGS.smtp_username and SETTINGS.smtp_password:
                smtp.login(SETTINGS.smtp_username, SETTINGS.smtp_password)
            smtp.send_message(message)
        return True
    except Exception:
        logger.exception("Failed to dispatch OneShot email to %s", target_email)
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
    token = OneShotToken(created_by_id=admin_user.id, target_email=body.target_email)
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
        .where(OneShotToken.id == token_id, OneShotToken.is_used == False)  # noqa: E712
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
    with storage_path.open("wb") as out:
        while True:
            chunk = await file.read(CHUNK_SIZE)
            if not chunk:
                break
            size_bytes += len(chunk)
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
    await file.close()
    return OneShotUploadResponse(file_id=file_id)
