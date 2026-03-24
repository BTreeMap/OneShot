from __future__ import annotations

import asyncio
from pathlib import Path

from fastapi.testclient import TestClient
from h4ckath0n.auth.models import User
from sqlalchemy import select

from app.main import app
from app.rng import new_file_id, new_oneshot_token_id
from app.uploads.models import FileMetadata, OneShotToken


def test_new_file_id_format() -> None:
    value = new_file_id()
    assert len(value) == 32
    assert value.startswith("f")


def test_oneshot_token_cannot_be_reused(tmp_path: Path) -> None:
    from app.uploads import router as uploads_router

    uploads_router.LOCAL_UPLOAD_DIR = tmp_path

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
