"""Privacy scope check (API edge, SPEC §5 / §8).

Enforces minimum-scope principles. Scaffold: allowed signal types are
whitelisted and coarse-grained only.
"""

from __future__ import annotations

ALLOWED_SIGNAL_TYPES = {"calendar_free_slot", "weather", "coarse_location", "usage_state", "notification_interaction"}
FORBIDDEN_SIGNAL_TYPES = {"exact_track", "contacts_full", "chat_content"}


def check_signal(signal_type: str) -> tuple[bool, str]:
    if signal_type in FORBIDDEN_SIGNAL_TYPES:
        return False, "out_of_scope"
    if signal_type not in ALLOWED_SIGNAL_TYPES:
        return False, "unknown"
    return True, "ok"
