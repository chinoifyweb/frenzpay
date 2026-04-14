"""
Admin API routes — separate auth from regular users.
Admin JWT uses the same secret but a different 'type' claim.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from jose import JWTError, jwt
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import InvalidCredentials
from app.core.security import verify_password
from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.kyc import KYCSubmission, KYCSubmissionStatus, KYCTierLevel
from app.models.transaction import Transaction, TransactionStatus
from app.models.user import AccountStatus, KYCStatus, KYCTier, User

router = APIRouter(prefix="/admin", tags=["admin"])
bearer = HTTPBearer(auto_error=False)

ADMIN_EMAILS = set()  # Populated from DB; for bootstrap use env var
ADMIN_JWT_TYPE = "admin_access"


# ── Auth ──────────────────────────────────────────────────────────────────────

class AdminLoginRequest(BaseModel):
    email: EmailStr
    password: str


def create_admin_token(email: str) -> str:
    expire = datetime.now(UTC) + timedelta(hours=8)
    return jwt.encode(
        {"sub": email, "exp": expire, "type": ADMIN_JWT_TYPE},
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )


async def get_admin_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    db: AsyncSession = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(401, "Admin auth required")
    try:
        payload = jwt.decode(credentials.credentials, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != ADMIN_JWT_TYPE:
            raise HTTPException(401, "Not an admin token")
        email = payload.get("sub", "")
    except JWTError:
        raise HTTPException(401, "Invalid admin token")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user or user.account_status != AccountStatus.ACTIVE:
        raise HTTPException(401, "Admin user not found or inactive")
    return user


AdminUser = Annotated[User, Depends(get_admin_user)]


@router.post("/login")
async def admin_login(data: AdminLoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email.lower()))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.password_hash):
        raise InvalidCredentials()
    # Only allow admin users (you can add an is_admin column or check email whitelist)
    token = create_admin_token(user.email)
    return {"access_token": token, "token_type": "bearer"}


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(_: AdminUser, db: AsyncSession = Depends(get_db)):
    from datetime import date, timedelta

    today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = today_start.replace(day=1)

    total_users = (await db.execute(select(func.count(User.id)))).scalar()
    active_users = (await db.execute(
        select(func.count(User.id)).where(User.account_status == AccountStatus.ACTIVE)
    )).scalar()
    kyc_pending = (await db.execute(
        select(func.count(KYCSubmission.id)).where(
            KYCSubmission.status == KYCSubmissionStatus.PENDING
        )
    )).scalar()
    txns_today = (await db.execute(
        select(func.count(Transaction.id)).where(
            Transaction.initiated_at >= today_start
        )
    )).scalar()
    revenue_today = (await db.execute(
        select(func.coalesce(func.sum(Transaction.frenzpay_fee), 0)).where(
            Transaction.initiated_at >= today_start,
            Transaction.status == TransactionStatus.COMPLETED,
        )
    )).scalar()
    revenue_month = (await db.execute(
        select(func.coalesce(func.sum(Transaction.frenzpay_fee), 0)).where(
            Transaction.initiated_at >= month_start,
            Transaction.status == TransactionStatus.COMPLETED,
        )
    )).scalar()

    # Daily signups — last 30 days
    daily_signups = []
    for i in range(29, -1, -1):
        day = today_start - timedelta(days=i)
        next_day = day + timedelta(days=1)
        count = (await db.execute(
            select(func.count(User.id)).where(
                User.created_at >= day, User.created_at < next_day
            )
        )).scalar()
        daily_signups.append({"date": day.strftime("%Y-%m-%d"), "count": count})

    # Daily revenue — last 30 days
    daily_revenue = []
    for i in range(29, -1, -1):
        day = today_start - timedelta(days=i)
        next_day = day + timedelta(days=1)
        amount = (await db.execute(
            select(func.coalesce(func.sum(Transaction.frenzpay_fee), 0)).where(
                Transaction.initiated_at >= day,
                Transaction.initiated_at < next_day,
                Transaction.status == TransactionStatus.COMPLETED,
            )
        )).scalar()
        daily_revenue.append({"date": day.strftime("%Y-%m-%d"), "amount": float(amount)})

    return {
        "total_users": total_users,
        "active_users": active_users,
        "kyc_pending": kyc_pending,
        "transactions_today": txns_today,
        "revenue_today": float(revenue_today),
        "revenue_month": float(revenue_month),
        "daily_signups": daily_signups,
        "daily_revenue": daily_revenue,
    }


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(
    _: AdminUser,
    db: AsyncSession = Depends(get_db),
    page: int = 1,
    search: str = "",
    role: str = "",
):
    q = select(User)
    if search:
        q = q.where(
            (User.email.ilike(f"%{search}%")) | (User.phone.ilike(f"%{search}%"))
        )
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    users = (await db.execute(q.order_by(User.created_at.desc()).offset((page - 1) * 50).limit(50))).scalars().all()
    return {
        "items": [_user_dict(u) for u in users],
        "total": total,
        "page": page,
        "pages": max(1, (total + 49) // 50),
    }


@router.post("/users/{user_id}/freeze")
async def freeze_user(user_id: str, _: AdminUser, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    user.account_status = AccountStatus.SUSPENDED
    return {"status": "suspended"}


@router.post("/users/{user_id}/activate")
async def activate_user(user_id: str, _: AdminUser, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    user.account_status = AccountStatus.ACTIVE
    return {"status": "active"}


# ── KYC ───────────────────────────────────────────────────────────────────────

@router.get("/kyc/queue")
async def kyc_queue(_: AdminUser, db: AsyncSession = Depends(get_db), page: int = 1):
    q = select(KYCSubmission, User).join(User).where(
        KYCSubmission.status == KYCSubmissionStatus.PENDING
    )
    total = (await db.execute(select(func.count()).select_from(
        select(KYCSubmission).where(KYCSubmission.status == KYCSubmissionStatus.PENDING).subquery()
    ))).scalar()
    rows = (await db.execute(
        q.order_by(KYCSubmission.submitted_at.asc()).offset((page - 1) * 50).limit(50)
    )).all()
    items = [
        {
            "id": str(sub.id),
            "user_id": str(sub.user_id),
            "user_email": user.email,
            "user_name": user.full_name,
            "tier": sub.tier.value,
            "status": sub.status.value,
            "submitted_at": sub.submitted_at.isoformat(),
            "provider": sub.provider.value,
        }
        for sub, user in rows
    ]
    return {"items": items, "total": total, "page": page, "pages": max(1, (total + 49) // 50)}


@router.post("/kyc/{submission_id}/approve")
async def approve_kyc(submission_id: str, _: AdminUser, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(KYCSubmission).where(KYCSubmission.id == uuid.UUID(submission_id))
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(404, "Submission not found")
    sub.status = KYCSubmissionStatus.VERIFIED
    sub.verified_at = datetime.now(UTC)

    # Promote user tier
    user_result = await db.execute(select(User).where(User.id == sub.user_id))
    user = user_result.scalar_one_or_none()
    if user:
        tier_map = {KYCTierLevel.TIER_1: KYCTier.TIER_1, KYCTierLevel.TIER_2: KYCTier.TIER_2, KYCTierLevel.TIER_3: KYCTier.TIER_3}
        user.kyc_tier = tier_map.get(sub.tier, user.kyc_tier)
        user.kyc_status = KYCStatus.APPROVED
    return {"status": "approved"}


class RejectKYCRequest(BaseModel):
    reason: str


@router.post("/kyc/{submission_id}/reject")
async def reject_kyc(
    submission_id: str, data: RejectKYCRequest, _: AdminUser, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(KYCSubmission).where(KYCSubmission.id == uuid.UUID(submission_id))
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(404, "Submission not found")
    sub.status = KYCSubmissionStatus.REJECTED
    sub.rejection_reason = data.reason
    return {"status": "rejected"}


# ── Transactions ──────────────────────────────────────────────────────────────

@router.get("/transactions")
async def list_transactions(
    _: AdminUser,
    db: AsyncSession = Depends(get_db),
    page: int = 1,
    status: str = "",
    search: str = "",
):
    q = select(Transaction, User).join(User)
    if status:
        q = q.where(Transaction.status == status)
    if search:
        q = q.where(
            (Transaction.reference.ilike(f"%{search}%")) |
            (User.email.ilike(f"%{search}%"))
        )

    count_q = select(func.count(Transaction.id)).join(User)
    if status:
        count_q = count_q.where(Transaction.status == status)
    if search:
        count_q = count_q.where(
            (Transaction.reference.ilike(f"%{search}%")) |
            (User.email.ilike(f"%{search}%"))
        )
    total = (await db.execute(count_q)).scalar()

    rows = (await db.execute(
        q.order_by(Transaction.initiated_at.desc()).offset((page - 1) * 50).limit(50)
    )).all()
    items = [
        {
            "id": str(tx.id),
            "reference": tx.reference,
            "user_email": user.email,
            "type": tx.type.value,
            "status": tx.status.value,
            "source_amount": float(tx.source_amount),
            "source_currency": tx.source_currency,
            "destination_amount": float(tx.destination_amount),
            "destination_currency": tx.destination_currency,
            "initiated_at": tx.initiated_at.isoformat(),
        }
        for tx, user in rows
    ]
    return {"items": items, "total": total, "page": page, "pages": max(1, (total + 49) // 50)}


# ── Risk flags (stub — table not in initial migration yet) ────────────────────

@router.get("/risk-flags")
async def risk_flags(_: AdminUser):
    return []  # TODO: implement risk_flags table


# ── Settings (platform config overview — no secrets exposed) ──────────────────

@router.get("/settings")
async def get_platform_settings(_: AdminUser):
    return {
        "platform": {
            "environment": settings.APP_ENV,
            "app_url": settings.APP_URL,
            "api_url": settings.API_URL,
        },
        "auth": {
            "access_token_ttl_minutes": settings.JWT_ACCESS_TTL_MINUTES,
            "refresh_token_ttl_days": settings.JWT_REFRESH_TTL_DAYS,
            "jwt_algorithm": settings.JWT_ALGORITHM,
            "otp_ttl_minutes": settings.OTP_TTL_MINUTES,
            "otp_max_attempts": settings.OTP_MAX_ATTEMPTS,
        },
        "email": {
            "from_address": settings.FROM_EMAIL,
            "purelymail_configured": bool(settings.PURELYMAIL_API_KEY),
        },
        "services": {
            "graph_payment_rails": bool(settings.GRAPH_API_KEY),
            "dojah_kyc": bool(settings.DOJAH_APP_ID and settings.DOJAH_PRIVATE_KEY),
            "termii_sms": bool(settings.TERMII_API_KEY),
            "sentry_monitoring": bool(settings.SENTRY_DSN),
            "telegram_alerts": bool(
                settings.ADMIN_ALERT_TELEGRAM_BOT_TOKEN and settings.ADMIN_ALERT_CHAT_ID
            ),
        },
        "cors_origins": settings.CORS_ORIGINS,
    }


# ── Wallets overview ───────────────────────────────────────────────────────────

@router.get("/wallets")
async def wallet_overview(_: AdminUser, db: AsyncSession = Depends(get_db)):
    from app.models.wallet import Currency, Wallet, WalletStatus

    total = (await db.execute(select(func.count(Wallet.id)))).scalar()
    frozen = (await db.execute(
        select(func.count(Wallet.id)).where(Wallet.status == WalletStatus.FROZEN)
    )).scalar()

    by_currency = []
    for currency in Currency:
        count = (await db.execute(
            select(func.count(Wallet.id)).where(Wallet.currency == currency)
        )).scalar()
        if not count:
            continue
        total_bal = (await db.execute(
            select(func.coalesce(func.sum(Wallet.balance), 0)).where(
                Wallet.currency == currency,
                Wallet.status == WalletStatus.ACTIVE,
            )
        )).scalar()
        by_currency.append({
            "currency": currency.value,
            "wallet_count": count,
            "total_balance": float(total_bal),
        })

    top_rows = (await db.execute(
        select(Wallet, User)
        .join(User)
        .where(Wallet.currency == Currency.USD)
        .order_by(Wallet.balance.desc())
        .limit(10)
    )).all()

    return {
        "total_wallets": total,
        "frozen_wallets": frozen,
        "by_currency": by_currency,
        "top_usd_wallets": [
            {
                "user_email": u.email,
                "user_name": u.full_name,
                "balance": float(w.balance),
                "available": float(w.available_balance),
                "held": float(w.held_balance),
                "status": w.status.value,
            }
            for w, u in top_rows
        ],
    }


# ── Audit logs ────────────────────────────────────────────────────────────────

@router.get("/audit-logs")
async def list_audit_logs(
    _: AdminUser,
    db: AsyncSession = Depends(get_db),
    page: int = 1,
    action: str = "",
):
    q = select(AuditLog, User).outerjoin(User, AuditLog.user_id == User.id)
    if action:
        q = q.where(AuditLog.action.ilike(f"%{action}%"))

    count_q = select(func.count(AuditLog.id))
    if action:
        count_q = count_q.where(AuditLog.action.ilike(f"%{action}%"))
    total = (await db.execute(count_q)).scalar()

    rows = (await db.execute(
        q.order_by(AuditLog.created_at.desc()).offset((page - 1) * 50).limit(50)
    )).all()

    items = [
        {
            "id": log.id,
            "user_email": user.email if user else None,
            "admin_id": str(log.admin_id) if log.admin_id else None,
            "action": log.action,
            "resource_type": log.resource_type,
            "resource_id": log.resource_id,
            "ip_address": log.ip_address,
            "created_at": log.created_at.isoformat(),
        }
        for log, user in rows
    ]
    return {"items": items, "total": total, "page": page, "pages": max(1, (total + 49) // 50)}


# ── User detail ───────────────────────────────────────────────────────────────

@router.get("/users/{user_id}")
async def get_user_detail(user_id: str, _: AdminUser, db: AsyncSession = Depends(get_db)):
    from app.models.wallet import Wallet

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")

    wallets = (await db.execute(
        select(Wallet).where(Wallet.user_id == user.id)
    )).scalars().all()

    tx_count = (await db.execute(
        select(func.count(Transaction.id)).where(Transaction.user_id == user.id)
    )).scalar()
    total_sent = (await db.execute(
        select(func.coalesce(func.sum(Transaction.source_amount), 0)).where(
            Transaction.user_id == user.id,
            Transaction.status == TransactionStatus.COMPLETED,
        )
    )).scalar()

    recent_tx = (await db.execute(
        select(Transaction)
        .where(Transaction.user_id == user.id)
        .order_by(Transaction.initiated_at.desc())
        .limit(5)
    )).scalars().all()

    return {
        **_user_dict(user),
        "wallets": [
            {
                "currency": w.currency.value,
                "balance": float(w.balance),
                "available": float(w.available_balance),
                "held": float(w.held_balance),
                "status": w.status.value,
            }
            for w in wallets
        ],
        "transaction_count": tx_count,
        "total_sent_usd": float(total_sent),
        "recent_transactions": [
            {
                "reference": tx.reference,
                "type": tx.type.value,
                "amount": float(tx.source_amount),
                "currency": tx.source_currency,
                "dest_amount": float(tx.destination_amount),
                "dest_currency": tx.destination_currency,
                "status": tx.status.value,
                "date": tx.initiated_at.isoformat(),
            }
            for tx in recent_tx
        ],
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _user_dict(u: User) -> dict:
    return {
        "id": str(u.id),
        "email": u.email,
        "phone": u.phone,
        "first_name": u.first_name,
        "last_name": u.last_name,
        "kyc_tier": u.kyc_tier.value,
        "kyc_status": u.kyc_status.value,
        "account_status": u.account_status.value,
        "country": u.country,
        "created_at": u.created_at.isoformat(),
    }
