import uuid
from typing import Annotated

from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.exceptions import AccountSuspended, Forbidden, Unauthorized
from app.core.security import decode_access_token
from app.database import get_db
from app.models.user import AccountStatus, KYCTier, User

bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    if not credentials:
        raise Unauthorized()
    try:
        user_id = decode_access_token(credentials.credentials)
    except JWTError:
        raise Unauthorized("Invalid or expired token")

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise Unauthorized("User not found")
    if user.account_status == AccountStatus.SUSPENDED:
        raise AccountSuspended()
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_kyc(min_tier: KYCTier):
    """Dependency factory: enforces minimum KYC tier."""
    tier_order = {KYCTier.TIER_0: 0, KYCTier.TIER_1: 1, KYCTier.TIER_2: 2, KYCTier.TIER_3: 3}

    async def _check(user: CurrentUser) -> User:
        if tier_order[user.kyc_tier] < tier_order[min_tier]:
            raise Forbidden(f"KYC {min_tier.value} required")
        return user

    return Depends(_check)


def get_client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
