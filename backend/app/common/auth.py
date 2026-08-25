"""Auth / session (API edge, SPEC §5). Scaffold stub.

A real deployment would verify a session token; here we derive a stable
`user_id` from an `X-User-Id` header (falling back to a demo user) so the API
is immediately usable without external auth.
"""

from __future__ import annotations

import uuid

from fastapi import Header

DEMO_USER_ID = "00000000-0000-0000-0000-000000000001"


def current_user_id(x_user_id: str | None = Header(default=None)) -> str:
    if x_user_id:
        return x_user_id
    return DEMO_USER_ID


def ensure_user(db, user_id: str):
    """Create the demo user row on first use so FK constraints hold."""
    from ..models import User

    user = db.get(User, user_id)
    if user is None:
        user = User(id=user_id, nickname="Demo", timezone="UTC")
        db.add(user)
        db.commit()
    return user
