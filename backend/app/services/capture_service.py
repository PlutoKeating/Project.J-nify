"""Capture Service (SPEC §7.1): raw_text -> ItemCommitment + initial policy.

Does NOT immediately generate a plan/pressure — only confirms and parks.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..models import EscalationPolicy, ItemCommitment


def capture(db: Session, user_id: str, *, raw_text: str, source_type: str, category: str, due_at) -> ItemCommitment:
    item = ItemCommitment(
        user_id=user_id,
        title=raw_text[:512],
        raw_text=raw_text,
        source_type=source_type,
        category=category,
        status="captured",
        due_at=due_at,
        est_minutes=10,
    )
    db.add(item)
    db.flush()

    policy = EscalationPolicy(item_id=item.id, policy_type="standard")
    db.add(policy)
    db.flush()

    # Transition captured -> parked (低电量漂浮).
    item.status = "parked"
    item.window_start = due_at
    db.commit()
    db.refresh(item)
    return item
