from __future__ import annotations

from functools import lru_cache

from .config import settings


@lru_cache(maxsize=1)
def get_redis():
    """Return a Redis client. Connection is lazy — failures surface on command.

    Callers must degrade gracefully (in-memory fallback) so the API stays up
    when Redis is unreachable; queue-critical paths raise QueueUnavailable.
    """
    import redis

    return redis.Redis.from_url(settings.REDIS_URL, decode_responses=True, socket_connect_timeout=2)
