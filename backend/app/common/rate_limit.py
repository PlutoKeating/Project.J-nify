"""Rate limit (API edge, SPEC §5). Scaffold stub with a simple in-memory
sliding-window counter, keyed by user id.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque

from ..config import settings

_buckets: dict[str, deque[float]] = defaultdict(deque)


def allow(user_id: str, limit: int | None = None) -> bool:
    limit = limit or settings.RATE_LIMIT_PER_MINUTE
    now = time.time()
    q = _buckets[user_id]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= limit:
        return False
    q.append(now)
    return True
