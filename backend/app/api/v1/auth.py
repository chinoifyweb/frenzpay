from fastapi import APIRouter, BackgroundTasks, Depends, Request

from app.core.dependencies import CurrentUser, get_client_ip
from app.core.email_templates import (
    login_alert_email,
    password_reset_email,
    signup_otp_email,
    welcome_email,
)
from app.core.rate_limit import rate_limit
from app.database import get_db
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    OTPResendRequest,
    OTPVerifyRequest,
    RefreshRequest,
    ResetPasswordRequest,
    SignupRequest,
    SignupResponse,
    TokenResponse,
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])

# Rate limits per the security checklist
_login_limit = Depends(rate_limit(5, 900))   # 5 / 15 min
_otp_limit = Depends(rate_limit(3, 300))     # 3 resends / 5 min


def _send_email_task(to: str, subject: str, html: str) -> None:
    """Enqueue a send_email Celery task without blocking the request."""
    from app.workers.notification_tasks import send_email
    send_email.delay(to=to, subject=subject, html=html)


@router.post("/signup", response_model=SignupResponse)
async def signup(
    data: SignupRequest,
    background: BackgroundTasks,
    request: Request,
    db=Depends(get_db),
):
    user, otp = await auth_service.signup(data, db)

    # Send OTP verification email
    subject, html = signup_otp_email(user.first_name, otp)
    background.add_task(_send_email_task, user.email, subject, html)

    return SignupResponse(user_id=str(user.id), email=user.email)


@router.post("/login", response_model=TokenResponse, dependencies=[_login_limit])
async def login(
    data: LoginRequest,
    background: BackgroundTasks,
    request: Request,
    db=Depends(get_db),
):
    ip = get_client_ip(request)
    ua = request.headers.get("user-agent", "")
    tokens = await auth_service.login(
        data.email, data.password, db, ip=ip, user_agent=ua,
        device_fingerprint=data.device_fingerprint,
    )

    # Fire-and-forget login alert email (do NOT await — don't slow down login)
    background.add_task(_send_login_alert, data.email, ip, ua, db)

    return tokens


async def _send_login_alert(email: str, ip: str, ua: str, db) -> None:
    """Fetch user name then enqueue a login-alert email."""
    from sqlalchemy import select
    from app.models.user import User
    result = await db.execute(select(User).where(User.email == email.lower()))
    user = result.scalar_one_or_none()
    if user:
        subject, html = login_alert_email(user.first_name, ip, ua)
        _send_email_task(user.email, subject, html)


@router.post("/verify-otp")
async def verify_otp(data: OTPVerifyRequest, db=Depends(get_db)):
    await auth_service.verify_signup_otp(data.identifier, data.otp, db)
    return {"message": "Phone verified successfully"}


@router.post("/resend-otp", dependencies=[_otp_limit])
async def resend_otp(
    data: OTPResendRequest,
    background: BackgroundTasks,
    db=Depends(get_db),
):
    new_otp = await auth_service.resend_signup_otp(data.identifier, db)
    if new_otp:
        subject, html = signup_otp_email(data.identifier.split()[0], new_otp)
        background.add_task(_send_email_task, data.identifier, subject, html)
    return {"message": "OTP sent"}


@router.post("/refresh", response_model=TokenResponse)
async def refresh(data: RefreshRequest, db=Depends(get_db)):
    return await auth_service.refresh_tokens(data.refresh_token, db)


@router.post("/logout")
async def logout(data: RefreshRequest, db=Depends(get_db)):
    await auth_service.logout(data.refresh_token, db)
    return {"message": "Logged out"}


@router.post("/forgot-password", dependencies=[_login_limit])
async def forgot_password(
    data: ForgotPasswordRequest,
    background: BackgroundTasks,
    db=Depends(get_db),
):
    result = await auth_service.request_password_reset_with_user(data.email, db)
    if result:
        user, otp = result
        subject, html = password_reset_email(user.first_name, otp)
        background.add_task(_send_email_task, data.email, subject, html)
    return {"message": "If that email is registered, a reset code has been sent"}


@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest, db=Depends(get_db)):
    await auth_service.reset_password(data.email, data.otp, data.new_password, db)
    return {"message": "Password reset successfully"}
