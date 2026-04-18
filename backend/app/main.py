from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import admin, auth, kyc, transactions, users, wallets, webhooks
from app.config import settings
from app.core.logging import configure_logging
from app.core.rate_limit import _RateLimitExceeded
from app.redis_client import close_redis, get_redis


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    if settings.SENTRY_DSN:
        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.APP_ENV,
            traces_sample_rate=0.1,
            # Strip PII from Sentry reports
            before_send=_scrub_pii,
        )
    # Warm up Redis connection
    get_redis()
    yield
    await close_redis()


def _scrub_pii(event, hint):
    """Remove PII fields from Sentry error reports."""
    if "request" in event:
        event["request"].pop("data", None)
        event["request"].pop("cookies", None)
    return event


app = FastAPI(
    title="FrenzPay API",
    version="1.0.0",
    docs_url="/api/docs" if settings.APP_ENV != "production" else None,
    redoc_url="/api/redoc" if settings.APP_ENV != "production" else None,
    lifespan=lifespan,
)

# CORS — strict whitelist
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.exception_handler(_RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: _RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"code": "RATE_LIMIT_EXCEEDED", "message": "Too many requests. Please slow down."},
        headers={"Retry-After": "60"},
    )


# Register routers
API_PREFIX = "/api/v1"
app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(users.router, prefix=API_PREFIX)
app.include_router(kyc.router, prefix=API_PREFIX)
app.include_router(wallets.router, prefix=API_PREFIX)
app.include_router(transactions.router, prefix=API_PREFIX)
app.include_router(webhooks.router, prefix=API_PREFIX)
app.include_router(admin.router, prefix=API_PREFIX)


@app.get("/")
async def root():
    return {
        "name": "FrenzPay API",
        "version": "1.0.0",
        "status": "online",
        "environment": settings.APP_ENV,
        "docs": "/api/docs" if settings.APP_ENV != "production" else None,
    }


@app.get("/health")
async def health():
    return {"status": "ok", "env": settings.APP_ENV}
