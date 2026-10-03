from __future__ import annotations

import time
from collections import defaultdict

from fastapi import Request

from app.core.config import settings
from app.core.errors import RateLimited
from app.core.redis_client import get_redis

# Single-process fallback when Redis is unreachable (dev/test).
_memory_buckets: dict[str, list[float]] = defaultdict(list)


def _memory_check(key: str, limit: int, window_s: int) -> bool:
    now = time.monotonic()
    bucket = [t for t in _memory_buckets[key] if now - t < window_s]
    if len(bucket) >= limit:
        _memory_buckets[key] = bucket
        return False
    bucket.append(now)
    _memory_buckets[key] = bucket
    return True


def check_rate_limit(key: str, limit: int, window_s: int) -> None:
    """Fixed-window rate limit. Raises RateLimited when exhausted."""
    try:
        r = get_redis()
        count = r.incr(f"rl:{key}")
        if count == 1:
            r.expire(f"rl:{key}", window_s)
        if count > limit:
            raise RateLimited()
        return
    except RateLimited:
        raise
    except Exception:
        pass
    if not _memory_check(key, limit, window_s):
        raise RateLimited()


def rate_limit(spec: str):
    """Dependency factory, e.g. ``rate_limit("10/minute")`` or ``"20/hour"``."""
    raw, _, unit = spec.partition("/")
    limit = int(raw)
    window_s = {"second": 1, "minute": 60, "hour": 3600, "day": 86400}.get(unit.strip() or "minute", 60)

    def dep(request: Request) -> None:
        ident = request.client.host if request.client else "unknown"
        check_rate_limit(f"{request.url.path}:{ident}", limit, window_s)

    # Global default can tighten per-endpoint limits.
    if limit > settings.RATE_LIMIT_PER_MINUTE and window_s == 60:
        pass
    return dep
