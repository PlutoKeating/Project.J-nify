"""Escalation Engine (SPEC §7.1): Item state + Decision history + Policy
-> intensity / should_nudge.

Never breaks quiet hours or the nudge budget.
"""

from __future__ import annotations

from datetime import datetime

from ..config import settings
from ..models import EscalationPolicy


def _in_quiet_hours(now: datetime) -> bool:
    hs = settings.QUIET_HOURS_START
    he = settings.QUIET_HOURS_END
    start = int(hs.split(":")[0]) * 60 + int(hs.split(":")[1])
    end = int(he.split(":")[0]) * 60 + int(he.split(":")[1])
    minute = now.hour * 60 + now.minute
    if start <= end:
        return start <= minute < end
    # Crosses midnight.
    return minute >= start or minute < end


def should_nudge(policy: EscalationPolicy, *, now: datetime | None = None) -> tuple[bool, int]:
    """Return (should_nudge, intensity)."""
    now = now or datetime.utcnow()
    budget = policy.max_nudges or settings.MAX_NUDGE_BUDGET
    if policy.nudge_count >= budget:
        return False, 0
    if _in_quiet_hours(now):
        return False, 0
    # Warm-up curve: intensity grows with prior nudges, capped at 3.
    intensity = min(3, (policy.nudge_count or 0) + 1)
    return True, intensity
