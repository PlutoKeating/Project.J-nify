"""Audit log (API edge, SPEC §5 / §8). Scaffold: writes structured audit rows
into the SQLite DB so sensitive actions are traceable.
"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

logger = logging.getLogger("jnify.audit")


def record(db: Session, *, user_id: str, action: str, detail: str = "") -> None:
    from ..models import SignalEvent  # reuse a lightweight table? no.

    # Keep it simple and dependency-free: log + persist to a dedicated audit
    # model would be added in a later phase. For the scaffold, logging suffices
    # as a traceable stub while we keep the boundary explicit.
    logger.info("audit user=%s action=%s detail=%s", user_id, action, detail)
