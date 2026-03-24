from __future__ import annotations

from typing import Awaitable, Callable, TypeVar

from fastapi.testclient import TestClient

T = TypeVar("T")


def run_in_app_loop(client: TestClient, fn: Callable[[], Awaitable[T]]) -> T:
    """Run an async test helper inside the FastAPI TestClient event loop.

    TestClient owns a portal and event loop for the app lifespan. Executing
    async DB helpers with asyncio.run() creates a separate loop, which can
    trigger asyncpg cross-loop RuntimeError in PostgreSQL-backed tests.
    """
    portal = client.portal
    if portal is None:
        msg = "TestClient portal not initialized"
        raise RuntimeError(msg)
    return portal.call(fn)
