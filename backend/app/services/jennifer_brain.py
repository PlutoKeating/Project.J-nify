"""Jennifer Brain (SPEC §7.1): window + item + memory -> title/body/options.

LLM gateway is a scaffold stub: it degrades to a deterministic template when no
real provider is configured. It NEVER decides when to interrupt — that belongs
to the Escalation Engine.
"""

from __future__ import annotations

from ..config import settings
from ..schemas import DecisionOption


def _draft_title(item, window) -> str:
    return item.title if item.title else "有一件事"


def _draft_body(item, window) -> str:
    if window:
        return window.reason_text or "我把这件事放在最顺手的位置了。"
    return "不急，但我帮您盯着。"


def draft(item, window) -> tuple[str, str, list[DecisionOption], bool]:
    """Returns (title, body, options, degraded)."""
    title = _draft_title(item, window)
    body = _draft_body(item, window)
    degraded = True  # always template-fallback in this scaffold

    options = [
        DecisionOption(code="now", label="现在做", action_type="do"),
        DecisionOption(code="later", label="晚点，换个窗口", action_type="defer"),
        DecisionOption(code="drop", label="这件事算了", action_type="drop"),
    ]
    if item.category in ("chore", "return"):
        options.append(DecisionOption(code="rescue", label="帮我兜底", action_type="rescue"))
    return title, body, options, degraded
