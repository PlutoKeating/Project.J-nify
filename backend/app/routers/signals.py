"""Signals router: POST /v1/signals (SPEC §7.2), subject to privacy scope."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..common.auth import current_user_id, ensure_user
from ..common.privacy_scope import check_signal
from ..database import get_db
from ..models import IntegrationSource, SignalEvent
from ..schemas import SignalEventIn, SignalEventOut
from ..services import context_engine

router = APIRouter(prefix="/v1/signals", tags=["signals"])


def _ensure_source(db: Session, user_id: str) -> IntegrationSource:
    source = (
        db.query(IntegrationSource)
        .filter(IntegrationSource.user_id == user_id)
        .first()
    )
    if source is None:
        source = IntegrationSource(user_id=user_id, provider="manual", auth_status="connected", scopes={})
        db.add(source)
        db.commit()
        db.refresh(source)
    return source


@router.post("", response_model=SignalEventOut)
def post_signal(
    req: SignalEventIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> SignalEventOut:
    ok, reason = check_signal(req.signal_type)
    if not ok:
        raise HTTPException(status_code=400, detail=f"signal out of scope: {reason}")

    ensure_user(db, user_id)
    source = _ensure_source(db, user_id)
    signal = SignalEvent(
        user_id=user_id,
        source_id=source.id,
        signal_type=req.signal_type,
        payload=req.payload,
        occurred_at=req.occurred_at,
    )
    db.add(signal)
    db.commit()
    db.refresh(signal)

    context_engine.ingest(db, user_id, signal)
    return SignalEventOut.model_validate(signal)
