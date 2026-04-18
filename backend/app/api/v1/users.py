from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.dependencies import CurrentUser, get_db
from app.core.exceptions import InvalidCredentials
from app.core.security import encrypt_pii, hash_password, verify_password
from app.database import get_db
from app.schemas.user import ChangePasswordRequest, ProfileUpdateRequest, UserPublic

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserPublic)
async def get_profile(user: CurrentUser):
    return user


@router.patch("/me", response_model=UserPublic)
async def update_profile(
    data: ProfileUpdateRequest, user: CurrentUser, db=Depends(get_db)
):
    if data.first_name is not None:
        user.first_name = data.first_name.strip()
    if data.last_name is not None:
        user.last_name = data.last_name.strip()
    if data.date_of_birth is not None:
        user.date_of_birth = data.date_of_birth
    return user


@router.post("/me/change-password")
async def change_password(
    data: ChangePasswordRequest, user: CurrentUser, db=Depends(get_db)
):
    if not verify_password(data.current_password, user.password_hash):
        raise InvalidCredentials()
    user.password_hash = hash_password(data.new_password)
    return {"message": "Password changed successfully"}


# ── 2FA (TOTP) ────────────────────────────────────────────────────────────────

class TwoFASetupResponse(BaseModel):
    secret: str
    qr_uri: str
    backup_codes: list[str]


class TwoFAVerifyRequest(BaseModel):
    code: str  # 6-digit TOTP code from authenticator app


class TwoFADisableRequest(BaseModel):
    password: str
    code: str


@router.post("/me/2fa/setup", response_model=TwoFASetupResponse)
async def setup_2fa(user: CurrentUser, db=Depends(get_db)):
    """
    Generate a new TOTP secret and return the provisioning URI.
    The user must then call /me/2fa/enable with a valid code to activate 2FA.
    The secret is stored encrypted until activation.
    """
    try:
        import pyotp
    except ImportError:
        raise HTTPException(500, "pyotp not installed — run: pip install pyotp")

    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    qr_uri = totp.provisioning_uri(name=user.email, issuer_name="FrenzPay")

    # Generate 8 single-use backup codes
    import secrets
    backup_codes = [secrets.token_hex(4).upper() for _ in range(8)]

    # Store encrypted secret temporarily (not yet active)
    try:
        user.two_factor_secret = encrypt_pii(secret)
    except Exception:
        user.two_factor_secret = secret  # Fallback if encryption not configured

    return TwoFASetupResponse(secret=secret, qr_uri=qr_uri, backup_codes=backup_codes)


@router.post("/me/2fa/enable")
async def enable_2fa(data: TwoFAVerifyRequest, user: CurrentUser, db=Depends(get_db)):
    """
    Verify a TOTP code and activate 2FA on the account.
    Must be called after /me/2fa/setup with a valid code from the authenticator app.
    """
    try:
        import pyotp
    except ImportError:
        raise HTTPException(500, "pyotp not installed")

    if not user.two_factor_secret:
        raise HTTPException(400, "2FA setup not initiated. Call /me/2fa/setup first.")

    try:
        from app.core.security import decrypt_pii
        secret = decrypt_pii(user.two_factor_secret)
    except Exception:
        secret = user.two_factor_secret  # Fallback

    totp = pyotp.TOTP(secret)
    if not totp.verify(data.code, valid_window=1):
        raise HTTPException(400, "Invalid TOTP code")

    user.two_factor_enabled = True
    return {"message": "2FA enabled successfully"}


@router.post("/me/2fa/disable")
async def disable_2fa(data: TwoFADisableRequest, user: CurrentUser, db=Depends(get_db)):
    """
    Disable 2FA. Requires current password and a valid TOTP code as confirmation.
    """
    try:
        import pyotp
    except ImportError:
        raise HTTPException(500, "pyotp not installed")

    if not verify_password(data.password, user.password_hash):
        raise InvalidCredentials()

    if not user.two_factor_enabled or not user.two_factor_secret:
        raise HTTPException(400, "2FA is not enabled on this account")

    try:
        from app.core.security import decrypt_pii
        secret = decrypt_pii(user.two_factor_secret)
    except Exception:
        secret = user.two_factor_secret

    totp = pyotp.TOTP(secret)
    if not totp.verify(data.code, valid_window=1):
        raise HTTPException(400, "Invalid TOTP code")

    user.two_factor_enabled = False
    user.two_factor_secret = None
    return {"message": "2FA disabled"}


@router.get("/me/2fa/status")
async def get_2fa_status(user: CurrentUser):
    """Check whether 2FA is enabled on the account."""
    return {"two_factor_enabled": user.two_factor_enabled}
