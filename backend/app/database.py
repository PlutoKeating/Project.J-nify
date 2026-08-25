"""SQLAlchemy engine / session factory.

Uses SQLite for the MVP scaffold; the URL is fully controlled via `.env`
(`DATABASE_URL`). The schema strictly mirrors the SPEC §6 ER diagram's 15
entities (defined in `app.models`).
"""

from __future__ import annotations

import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings

_is_sqlite = settings.DATABASE_URL.startswith("sqlite")
connect_args = {"check_same_thread": False} if _is_sqlite else {}

if _is_sqlite:
    _path = settings.DATABASE_URL.replace("sqlite:///", "", 1)
    if _path and _path != ":memory:":
        os.makedirs(os.path.dirname(_path) or ".", exist_ok=True)

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=False,
    future=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    future=True,
)


class Base(DeclarativeBase):
    """Declarative base for all mapped entities."""


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_all() -> None:
    """Create all tables (scaffold-only; use `alembic` for real migrations)."""
    # Import models so they register on Base.metadata.
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
