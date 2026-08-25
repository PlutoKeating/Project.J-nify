"""Opportunity Window Engine (SPEC §7.1): Item + Context + Preference -> OpportunityWindow.

Solves constraints and computes a fit score + a human-readable reason. It does
NOT generate copy (that belongs to Jennifer Brain).
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from ..models import ItemCommitment, OpportunityWindow


def compute(
    item: ItemCommitment,
    *,
    context_features: dict[str, Any] | None = None,
    now: datetime | None = None,
) -> OpportunityWindow:
    now = now or datetime.utcnow()
    ctx = context_features or {}

    # Deterministic reason selection common to the spec's five use cases.
    if item.due_at and item.due_at <= now + timedelta(days=10):
        reason_code = "due_soon"
        reason_text = f"还有 {max(1, (item.due_at - now).days)} 天到期，现在是顺手处理的好时机。"
        fit = 0.85
    elif item.category == "chore" and ctx.get("sunny"):
        reason_code = "weather"
        reason_text = "这两天天气合适，正是顺手处理的好时候。"
        fit = 0.8
    elif item.category == "social":
        reason_code = "usage_state"
        reason_text = "这会儿您比较放松，适合花一分钟收个尾。"
        fit = 0.75
    else:
        reason_code = "manual_window"
        reason_text = "我把这件事放在了「最顺手」的位置，您随时可以处理。"
        fit = 0.5

    window = OpportunityWindow(
        item_id=item.id,
        window_start=now,
        window_end=now + timedelta(hours=8),
        fit_score=fit,
        reason_code=reason_code,
        reason_text=reason_text,
        status="candidate",
    )
    return window
