"""
Simple Redis-backed sliding-window rate limiter.
"""

import time
from collections.abc import Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse

from app.redis_client import get_redis


async def check_rate_limit(key: str, max_requests: int, window_seconds: int) -> bool:
    """
    Returns True if the request is within limit, False if rate-limited.
    Uses a Redis sorted set as a sliding window.
    """
    redis = get_redis()
    now = time.time()
    window_start = now - window_seconds

    pipe = redis.pipeline()
    pipe.zremrangebyscore(key, "-inf", window_start)
    pipe.zadd(key, {str(now): now})
    pipe.zcard(key)
    pipe.expire(key, window_seconds + 1)
    results = await pipe.execute()

    count = results[2]
    return count <= max_requests


def rate_limit(max_requests: int, window_seconds: int, key_func: Callable[[Request], str] | None = None):
    """
    FastAPI dependency for rate limiting.
    Usage: Depends(rate_limit(5, 900))  # 5 requests per 15 minutes
    """

    async def _limiter(request: Request) -> None:
        if key_func:
            key = key_func(request)
        else:
            ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
            key = f"rl:{request.url.path}:{ip}"

        allowed = await check_rate_limit(key, max_requests, window_seconds)
        if not allowed:
            raise _RateLimitExceeded()

    return _limiter


class _RateLimitExceeded(Exception):
    pass
