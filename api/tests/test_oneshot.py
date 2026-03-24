from __future__ import annotations

import asyncio
import base64
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import jwt
from fastapi.testclient import TestClient
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import select

from app.main import app
from app.rng import new_file_id, new_oneshot_token_id
from app.uploads.models import FileMetadata, OneShotToken
from h4ckath0n.auth.models import Device, User


def test_new_file_id_format() -> None:
    value = new_file_id()
    assert len(value) == 32
    assert value.startswith("f")


def test_oneshot_token_cannot_be_reused(tmp_path: Path) -> None:
    from app.uploads import router as uploads_router

    uploads_router.SETTINGS.local_upload_dir = tmp_path

    with TestClient(app) as client:
        async def _seed() -> str:
            async with app.state.async_session_factory() as db:
                user = User()
                db.add(user)
                await db.flush()
                token = OneShotToken(id=new_oneshot_token_id(), created_by_id=user.id)
                db.add(token)
                await db.commit()
                return token.id

        token_id = asyncio.run(_seed())

        files = {"file": ("test.txt", b"hello", "text/plain")}
        first = client.post(
            "/api/oneshot/upload",
            files=files,
            headers={"Authorization": f"Bearer {token_id}"},
        )
        assert first.status_code == 200

        second = client.post(
            "/api/oneshot/upload",
            files=files,
            headers={"Authorization": f"Bearer {token_id}"},
        )
        assert second.status_code == 401

        async def _verify() -> None:
            async with app.state.async_session_factory() as db:
                token = (
                    await db.execute(select(OneShotToken).where(OneShotToken.id == token_id))
                ).scalar_one()
                assert token.is_used is True

                row = (
                    await db.execute(select(FileMetadata).where(FileMetadata.token_id == token_id))
                ).scalar_one()
                assert row.original_filename == "test.txt"
                assert row.size_bytes == 5

        asyncio.run(_verify())


def test_expired_oneshot_token_is_rejected(tmp_path: Path) -> None:
    from app.uploads import router as uploads_router

    uploads_router.SETTINGS.local_upload_dir = tmp_path

    with TestClient(app) as client:
        async def _seed() -> str:
            async with app.state.async_session_factory() as db:
                user = User()
                db.add(user)
                await db.flush()
                token = OneShotToken(
                    id=new_oneshot_token_id(),
                    created_by_id=user.id,
                    expires_at=datetime.now(UTC) - timedelta(minutes=1),
                )
                db.add(token)
                await db.commit()
                return token.id

        token_id = asyncio.run(_seed())

        response = client.post(
            "/api/oneshot/upload",
            files={"file": ("expired.txt", b"hello", "text/plain")},
            headers={"Authorization": f"Bearer {token_id}"},
        )
        assert response.status_code == 401

        async def _verify() -> None:
            async with app.state.async_session_factory() as db:
                token = (
                    await db.execute(select(OneShotToken).where(OneShotToken.id == token_id))
                ).scalar_one()
                assert token.is_used is False

        asyncio.run(_verify())


def test_oneshot_upload_exceeding_quota_rolls_back_and_cleans_file(tmp_path: Path) -> None:
    from app.uploads import router as uploads_router

    uploads_router.SETTINGS.local_upload_dir = tmp_path
    original_max_upload_bytes = uploads_router.MAX_UPLOAD_BYTES
    uploads_router.MAX_UPLOAD_BYTES = 4

    try:
        with TestClient(app) as client:
            async def _seed() -> str:
                async with app.state.async_session_factory() as db:
                    user = User()
                    db.add(user)
                    await db.flush()
                    token = OneShotToken(id=new_oneshot_token_id(), created_by_id=user.id)
                    db.add(token)
                    await db.commit()
                    return token.id

            token_id = asyncio.run(_seed())

            response = client.post(
                "/api/oneshot/upload",
                files={"file": ("big.bin", b"12345", "application/octet-stream")},
                headers={"Authorization": f"Bearer {token_id}"},
            )
            assert response.status_code == 413

            async def _verify() -> None:
                async with app.state.async_session_factory() as db:
                    token = (
                        await db.execute(select(OneShotToken).where(OneShotToken.id == token_id))
                    ).scalar_one()
                    assert token.is_used is False

                    metadata = (
                        await db.execute(select(FileMetadata).where(FileMetadata.token_id == token_id))
                    ).scalar_one_or_none()
                    assert metadata is None

            asyncio.run(_verify())
            assert list(tmp_path.iterdir()) == []
    finally:
        uploads_router.MAX_UPLOAD_BYTES = original_max_upload_bytes


def _jwk_b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _mint_http_jwt(user_id: str, device_id: str, private_key: ec.EllipticCurvePrivateKey) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": user_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=5)).timestamp()),
        "aud": "h4ckath0n:http",
    }
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    return jwt.encode(payload, private_pem, algorithm="ES256", headers={"kid": device_id})


def test_admin_file_download_requires_admin(tmp_path: Path) -> None:
    from app.uploads import router as uploads_router

    uploads_router.SETTINGS.local_upload_dir = tmp_path

    with TestClient(app) as client:
        async def _seed() -> tuple[str, str, str]:
            async with app.state.async_session_factory() as db:
                uploader = User(role="admin")
                non_admin = User(role="user")
                db.add_all([uploader, non_admin])
                await db.flush()

                token = OneShotToken(id=new_oneshot_token_id(), created_by_id=uploader.id)
                db.add(token)
                await db.flush()

                file_id = new_file_id()
                db.add(
                    FileMetadata(
                        id=file_id,
                        original_filename="secret.txt",
                        mime_type="text/plain",
                        size_bytes=5,
                        token_id=token.id,
                    )
                )

                non_admin_jwt = ""
                for user in (uploader, non_admin):
                    private_key = ec.generate_private_key(ec.SECP256R1())
                    public_numbers = private_key.public_key().public_numbers()
                    x = public_numbers.x.to_bytes(32, "big")
                    y = public_numbers.y.to_bytes(32, "big")
                    jwk = {
                        "kty": "EC",
                        "crv": "P-256",
                        "x": _jwk_b64(x),
                        "y": _jwk_b64(y),
                    }
                    device = Device(user_id=user.id, public_key_jwk=json.dumps(jwk))
                    db.add(device)
                    await db.flush()
                    if user.id == non_admin.id:
                        non_admin_jwt = _mint_http_jwt(non_admin.id, device.id, private_key)

                await db.commit()
                return file_id, non_admin.id, non_admin_jwt

        file_id, _, non_admin_jwt = asyncio.run(_seed())
        (tmp_path / file_id).write_bytes(b"hello")

        response = client.get(
            f"/api/admin/files/{file_id}/download",
            headers={"Authorization": f"Bearer {non_admin_jwt}"},
        )
        assert response.status_code == 403


def test_admin_file_download_sets_content_disposition_filename(tmp_path: Path) -> None:
    from app.uploads import router as uploads_router

    uploads_router.SETTINGS.local_upload_dir = tmp_path

    with TestClient(app) as client:
        async def _seed() -> tuple[str, str]:
            async with app.state.async_session_factory() as db:
                admin = User(role="admin")
                db.add(admin)
                await db.flush()

                token = OneShotToken(id=new_oneshot_token_id(), created_by_id=admin.id)
                db.add(token)
                await db.flush()

                file_id = new_file_id()
                original_filename = "evidence-report.pdf"
                db.add(
                    FileMetadata(
                        id=file_id,
                        original_filename=original_filename,
                        mime_type="application/pdf",
                        size_bytes=5,
                        token_id=token.id,
                    )
                )

                private_key = ec.generate_private_key(ec.SECP256R1())
                public_numbers = private_key.public_key().public_numbers()
                x = public_numbers.x.to_bytes(32, "big")
                y = public_numbers.y.to_bytes(32, "big")
                jwk = {
                    "kty": "EC",
                    "crv": "P-256",
                    "x": _jwk_b64(x),
                    "y": _jwk_b64(y),
                }
                device = Device(user_id=admin.id, public_key_jwk=json.dumps(jwk))
                db.add(device)
                await db.flush()
                token_jwt = _mint_http_jwt(admin.id, device.id, private_key)

                await db.commit()
                return file_id, token_jwt

        file_id, token_jwt = asyncio.run(_seed())
        (tmp_path / file_id).write_bytes(b"hello")

        response = client.get(
            f"/api/admin/files/{file_id}/download",
            headers={"Authorization": f"Bearer {token_jwt}"},
        )

        assert response.status_code == 200
        assert "attachment;" in response.headers["content-disposition"]
        assert 'filename="evidence-report.pdf"' in response.headers["content-disposition"]
