from __future__ import annotations

import asyncio
import base64
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.rng import new_file_id
from app.uploads.models import OneShotToken
from h4ckath0n.auth.models import Device, User


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


def test_oneshot_module_integration_user_story(tmp_path: Path) -> None:
    from app.uploads import router as uploads_router

    uploads_router.SETTINGS.local_upload_dir = tmp_path

    with TestClient(app) as client:
        async def _seed_admin() -> str:
            async with app.state.async_session_factory() as db:
                admin = User(role="admin")
                db.add(admin)
                await db.flush()

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
                admin_jwt = _mint_http_jwt(admin.id, device.id, private_key)
                await db.commit()
                return admin_jwt

        admin_jwt = asyncio.run(_seed_admin())

        create_response = client.post(
            "/api/admin/oneshot-tokens",
            json={"target_email": "recipient@example.com"},
            headers={"Authorization": f"Bearer {admin_jwt}"},
        )
        assert create_response.status_code == 201
        token_id = create_response.json()["token_id"]
        assert token_id.startswith("t")
        async def _assert_expiry_is_set() -> None:
            async with app.state.async_session_factory() as db:
                token = (
                    await db.execute(select(OneShotToken).where(OneShotToken.id == token_id))
                ).scalar_one()
                assert token.expires_at > token.created_at

        asyncio.run(_assert_expiry_is_set())

        upload_response = client.post(
            "/api/oneshot/upload",
            files={"file": ("incident.txt", b"classified-bytes", "text/plain")},
            headers={"Authorization": f"Bearer {token_id}"},
        )
        assert upload_response.status_code == 200
        file_id = upload_response.json()["file_id"]
        assert file_id.startswith("f")

        replay_upload = client.post(
            "/api/oneshot/upload",
            files={"file": ("replay.txt", b"blocked", "text/plain")},
            headers={"Authorization": f"Bearer {token_id}"},
        )
        assert replay_upload.status_code == 401

        tokens_response = client.get(
            "/api/admin/oneshot-tokens",
            headers={"Authorization": f"Bearer {admin_jwt}"},
        )
        assert tokens_response.status_code == 200
        token_row = next(row for row in tokens_response.json() if row["id"] == token_id)
        assert token_row["target_email"] == "recipient@example.com"
        assert token_row["is_used"] is True
        assert token_row["created_at"]

        files_response = client.get(
            "/api/admin/files",
            headers={"Authorization": f"Bearer {admin_jwt}"},
        )
        assert files_response.status_code == 200
        file_row = next(row for row in files_response.json() if row["id"] == file_id)
        assert file_row["original_filename"] == "incident.txt"
        assert file_row["target_email"] == "recipient@example.com"
        assert file_row["size_bytes"] == len(b"classified-bytes")
        assert file_row["created_at"]

        download_response = client.get(
            f"/api/admin/files/{file_id}/download",
            headers={"Authorization": f"Bearer {admin_jwt}"},
        )
        assert download_response.status_code == 200
        assert download_response.content == b"classified-bytes"
        assert 'filename="incident.txt"' in download_response.headers["content-disposition"]

        disk_path = tmp_path / file_id
        disk_path.unlink()
        missing_disk_response = client.get(
            f"/api/admin/files/{file_id}/download",
            headers={"Authorization": f"Bearer {admin_jwt}"},
        )
        assert missing_disk_response.status_code == 404

        missing_db_response = client.get(
            f"/api/admin/files/{new_file_id()}/download",
            headers={"Authorization": f"Bearer {admin_jwt}"},
        )
        assert missing_db_response.status_code == 404
