"""Context Engine (SPEC §7.1): SignalEvent -> ContextSnapshot.

Ingests signals, aggregates features, computes availability/friction scores.
It does NOT directly send notifications.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..models import ContextSnapshot, SignalEvent


def ingest(db: Session, user_id: str, signal: SignalEvent) -> ContextSnapshot:
    features: dict = signal.payload or {}
    # Deterministic-ish scaffold scoring; real features come from calendar /
    # weather / position / usage signals in a later phase.
    availability = 0.6 if features.get("free_slot") else 0.3
    friction = 0.2 if features.get("low_friction") else 0.7

    snapshot = ContextSnapshot(
        user_id=user_id,
        snapshot_key=f"{signal.signal_type}:{signal.occurred_at.isoformat()}",
        context_features=features,
        availability_score=availability,
        friction_score=friction,
    )
    snapshot.signal_events.append(signal)
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return snapshot
