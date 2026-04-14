"""
Auth service: signup, login, OTP, refresh token, password reset.
All password hashing and JWT creation happens here.
"""

import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import (
    EmailAlreadyExists,
    InvalidCredentials,
    OTPInvalid,
    OTPMaxAttempts,
    PhoneAlreadyExists,
    Unauthorized,
    UserNotFound,
)
from app.core.security import (
    create_access_token,
    create_refresh_token,
    generate_otp,
    generate_referral_code,
    hash_otp,
    hash_password,
    hash_token,
    password_needs_rehash,
    verify_otp,
    verify_password,
)
from app.models.user import AccountStatus, KYCTier, OTPCode, OTPPurpose, User, UserSession
from app.schemas.auth import SignupRequest, TokenResponse


async def signup(data: SignupRequest, db: AsyncSession) -> tuple[User, str]:
    """
    Create a new user. Returns (user, otp) — the OTP must be sent to the user's phone.
    """
    # Check uniqueness
    existing_email = await db.execute(select(User).where(User.email == data.email.lower()))
    if existing_email.scalar_one_or_none():
        raise EmailAlreadyExists()

    existing_phone = await db.execute(select(User).where(User.phone == data.phone))
    if existing_phone.scalar_one_or_none():
        raise PhoneAlreadyExists()

    # Resolve referral
    referred_by_id = None
    if data.referral_code:
        result = await db.execute(
            select(User).where(User.referral_code == data.referral_code.upper())
        )
        referrer = result.scalar_one_or_none()
        if referrer:
            referred_by_id = referrer.id

    user = User(
        email=data.email.lower(),
        phone=data.phone,
        password_hash=hash_password(data.password),
        first_name=data.first_name.strip(),
        last_name=data.last_name.strip(),
        country=data.country.upper(),
        kyc_tier=KYCTier.TIER_0,
        account_status=AccountStatus.ACTIVE,
        referral_code=generate_referral_code(),
        referred_by=referred_by_id,
    )
    db.add(user)
    await db.flush()  # get user.id before creating OTP

    otp = await _create_otp(user.id, data.phone, OTPPurpose.SIGNUP, db)
    return user, otp


async def login(
    email: str,
    password: str,
    db: AsyncSession,
    ip: str = "",
    user_agent: str = "",
    device_fingerprint: str | None = None,
) -> TokenResponse:
    result = await db.execute(select(User).where(User.email == email.lower()))
    user = result.scalar_one_or_none()

    if not user or not verify_password(password, user.password_hash):
        raise InvalidCredentials()

    if user.account_status == AccountStatus.SUSPENDED:
        raise InvalidCredentials()  # Don't reveal suspension to brute-forcers

    # Rehash if Argon2 params changed
    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)

    user.last_login_at = datetime.now(UTC)

    access_token = create_access_token(str(user.id))
    raw_refresh, hashed_refresh = create_refresh_token()

    session = UserSession(
        user_id=user.id,
        refresh_token_hash=hashed_refresh,
        device_fingerprint=device_fingerprint,
        ip_address=ip,
        user_agent=user_agent,
        expires_at=datetime.now(UTC) + timedelta(days=settings.JWT_REFRESH_TTL_DAYS),
    )
    db.add(session)

    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
        expires_in=settings.JWT_ACCESS_TTL_MINUTES * 60,
    )


async def refresh_tokens(raw_refresh_token: str, db: AsyncSession) -> TokenResponse:
    hashed = hash_token(raw_refresh_token)
    result = await db.execute(
        select(UserSession).where(
            UserSession.refresh_token_hash == hashed,
            UserSession.expires_at > datetime.now(UTC),
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise Unauthorized("Refresh token invalid or expired")

    # Rotate: delete old session, create new one
    await db.delete(session)

    access_token = create_access_token(str(session.user_id))
    raw_new, hashed_new = create_refresh_token()

    new_session = UserSession(
        user_id=session.user_id,
        refresh_token_hash=hashed_new,
        device_fingerprint=session.device_fingerprint,
        ip_address=session.ip_address,
        user_agent=session.user_agent,
        expires_at=datetime.now(UTC) + timedelta(days=settings.JWT_REFRESH_TTL_DAYS),
    )
    db.add(new_session)

    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_new,
        expires_in=settings.JWT_ACCESS_TTL_MINUTES * 60,
    )


async def logout(raw_refresh_token: str, db: AsyncSession) -> None:
    hashed = hash_token(raw_refresh_token)
    result = await db.execute(
        select(UserSession).where(UserSession.refresh_token_hash == hashed)
    )
    session = result.scalar_one_or_none()
    if session:
        await db.delete(session)


async def verify_signup_otp(phone: str, otp: str, db: AsyncSession) -> User:
    otp_record = await _get_valid_otp(phone, OTPPurpose.SIGNUP, db)
    _check_and_consume_otp(otp_record, otp)

    result = await db.execute(select(User).where(User.phone == phone))
    user = result.scalar_one_or_none()
    if not user:
        raise UserNotFound()

    otp_record.used_at = datetime.now(UTC)
    return user


async def request_password_reset(email: str, db: AsyncSession) -> str | None:
    result = await db.execute(select(User).where(User.email == email.lower()))
    user = result.scalar_one_or_none()
    if not user:
        return None  # Silently succeed to prevent email enumeration
    return await _create_otp(user.id, email, OTPPurpose.PASSWORD_RESET, db)


async def reset_password(email: str, otp: str, new_password: str, db: AsyncSession) -> None:
    otp_record = await _get_valid_otp(email, OTPPurpose.PASSWORD_RESET, db)
    _check_and_consume_otp(otp_record, otp)

    result = await db.execute(select(User).where(User.email == email.lower()))
    user = result.scalar_one_or_none()
    if not user:
        raise UserNotFound()

    user.password_hash = hash_password(new_password)
    otp_record.used_at = datetime.now(UTC)

    # Invalidate all sessions after password reset
    sessions = await db.execute(
        select(UserSession).where(UserSession.user_id == user.id)
    )
    for session in sessions.scalars():
        await db.delete(session)


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _create_otp(
    user_id: uuid.UUID | None, identifier: str, purpose: OTPPurpose, db: AsyncSession
) -> str:
    raw_otp = generate_otp()
    expires = datetime.now(UTC) + timedelta(minutes=settings.OTP_TTL_MINUTES)
    record = OTPCode(
        user_id=user_id,
        identifier=identifier,
        code_hash=hash_otp(raw_otp),
        purpose=purpose,
        expires_at=expires,
    )
    db.add(record)
    return raw_otp


async def _get_valid_otp(identifier: str, purpose: OTPPurpose, db: AsyncSession) -> OTPCode:
    result = await db.execute(
        select(OTPCode)
        .where(
            OTPCode.identifier == identifier,
            OTPCode.purpose == purpose,
            OTPCode.used_at.is_(None),
            OTPCode.expires_at > datetime.now(UTC),
        )
        .order_by(OTPCode.expires_at.desc())
        .limit(1)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise OTPInvalid()
    return record


def _check_and_consume_otp(record: OTPCode, plain_otp: str) -> None:
    if record.attempts >= settings.OTP_MAX_ATTEMPTS:
        raise OTPMaxAttempts()
    record.attempts += 1
    if not verify_otp(plain_otp, record.code_hash):
        raise OTPInvalid()
