from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Request

from app.core.dependencies import CurrentUser, get_client_ip
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


@router.post("/signup", response_model=SignupResponse)
async def signup(
    data: SignupRequest,
    background: BackgroundTasks,
    request: Request,
    db=Depends(get_db),
):
    user, otp = await auth_service.signup(data, db)
    # TODO: background.add_task(termii_client.send_otp, user.phone, otp)
    return SignupResponse(user_id=str(user.id), email=user.email)


@router.post("/login", response_model=TokenResponse, dependencies=[_login_limit])
async def login(
    data: LoginRequest,
    request: Request,
    db=Depends(get_db),
):
    ip = get_client_ip(request)
    ua = request.headers.get("user-agent", "")
    return await auth_service.login(
        data.email, data.password, db, ip=ip, user_agent=ua,
        device_fingerprint=data.device_fingerprint,
    )


@router.post("/verify-otp")
async def verify_otp(data: OTPVerifyRequest, db=Depends(get_db)):
    await auth_service.verify_signup_otp(data.identifier, data.otp, db)
    return {"message": "Phone verified successfully"}


@router.post("/resend-otp", dependencies=[_otp_limit])
async def resend_otp(data: OTPResendRequest, background: BackgroundTasks, db=Depends(get_db)):
    # TODO: generate new OTP and send via Termii
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
    data: ForgotPasswordRequest, background: BackgroundTasks, db=Depends(get_db)
):
    otp = await auth_service.request_password_reset(data.email, db)
    # TODO: if otp: background.add_task(resend_client.send_reset_email, data.email, otp)
    return {"message": "If that email is registered, a reset code has been sent"}


@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest, db=Depends(get_db)):
    await auth_service.reset_password(data.email, data.otp, data.new_password, db)
    return {"message": "Password reset successfully"}
