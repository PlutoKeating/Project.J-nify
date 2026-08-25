"""Decision Feedback Service (SPEC §7.1): decision + feedback
-> preference / memory update.

Records the decision, advances the item state machine, and writes a memory note
for calibration (never used to shame the user).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from ..models import Decision, ItemCommitment, MemoryNote

# decision code -> target item status (SPEC §1.4 / §6.1 state machine)
_STATUS_MAP = {
    "now": "done",
    "later": "deferred",
    "drop": "abandoned",
    "rescue": "rescued",
}


def close_loop(
    db: Session,
    *,
    user_id: str,
    item: ItemCommitment,
    decision: str,
    reason: str = "",
    option_id: str | None = None,
    nudge_id: str | None = None,
) -> Decision:
    record = Decision(
        user_id=user_id,
        item_id=item.id,
        nudge_id=nudge_id,
        option_id=option_id,
        decision=decision,
        reason=reason,
        effect_metrics={"decision": decision, "reason": reason},
    )
    db.add(record)
    db.flush()

    target = _STATUS_MAP.get(decision, item.status)
    item.status = target
    if target in ("done", "abandoned"):
        item.closed_at = datetime.utcnow()

    note = MemoryNote(
        user_id=user_id,
        item_id=item.id,
        decision_id=record.id,
        memory_type="decision_effect",
        content=f"decision={decision}; reason={reason}",
        salience=0.5 if decision != "rescue" else 0.8,
    )
    db.add(note)
    db.commit()
    db.refresh(record)
    return record
