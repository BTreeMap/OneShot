"""OneShot ID generation helpers."""

from __future__ import annotations

from h4ckath0n.auth.passkeys.ids import random_base32

_ID_LEN = 32
_ALLOWED_CHARS = set("abcdefghijklmnopqrstuvwxyz234567")


def new_file_id() -> str:
    """Generate a file ID (32 chars, starts with 'f')."""
    s = random_base32()
    return "f" + s[1:]


def new_oneshot_token_id() -> str:
    """Generate a one-shot token ID (32 chars, starts with 't')."""
    s = random_base32()
    return "t" + s[1:]


def is_file_id(value: str) -> bool:
    """Return True when *value* looks like a valid file ID."""
    return (
        len(value) == _ID_LEN and value[:1] == "f" and all(c in _ALLOWED_CHARS for c in value[1:])
    )


def is_oneshot_token_id(value: str) -> bool:
    """Return True when *value* looks like a valid one-shot token ID."""
    return (
        len(value) == _ID_LEN and value[:1] == "t" and all(c in _ALLOWED_CHARS for c in value[1:])
    )
