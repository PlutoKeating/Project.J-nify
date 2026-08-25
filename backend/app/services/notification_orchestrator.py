"""Notification Orchestrator (SPEC §7.1): nudge job -> sent/cancelled/replaced.

No reason => no send (reason-required gate). Also creates Nudge + NudgeOptions.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..models import Nudge, NudgeOption, OpportunityWindow
from ..schemas import DecisionOption
from .escalation_engine import should_nudge
from .jennifer_brain import draft


def build_nudge(
    db: Session,
    item,
    window: OpportunityWindow,
    *,
    policy,
    options: list[DecisionOption],
    now=None,
) -> Nudge | None:
    """Create a Nudge, but only if the escalation policy permits it.

    The reason-required gate is enforced here: a window without `reason_text`
    will not produce a notification.
    """
    allowed, intensity = should_nudge(policy, now=now)
    if not allowed:
        return None
    if not window.reason_text:
        return None  # 没有理由不通知

    title, body, default_options, _degraded = draft(item, window)
    effective_options = options or default_options
    nudge = Nudge(
        item_id=item.id,
        window_id=window.id,
        intensity=intensity,
        channel="push",
        title=title,
        body=body,
        status="scheduled",
    )
    db.add(nudge)
    db.flush()

    for i, opt in enumerate(effective_options):
        db.add(
            NudgeOption(
                nudge_id=nudge.id,
                option_code=opt.code,
                label=opt.label,
                action_type=opt.action_type,
                sort_order=i,
            )
        )

    policy.nudge_count = (policy.nudge_count or 0) + 1
    db.commit()
    db.refresh(nudge)
    return nudge
