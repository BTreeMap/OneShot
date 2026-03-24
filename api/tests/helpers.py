from __future__ import annotations

from typing import Awaitable, Callable, TypeVar

from fastapi.testclient import TestClient

T = TypeVar("T")


def run_in_app_loop(client: TestClient, fn: Callable[[], Awaitable[T]]) -> T:
    portal = client.portal
    if portal is None:
        msg = "TestClient portal not initialized"
        raise RuntimeError(msg)
    return portal.call(fn)
