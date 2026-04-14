from fastapi import HTTPException, status


class AppError(HTTPException):
    """Base application error with a machine-readable code."""

    def __init__(self, status_code: int, code: str, detail: str):
        super().__init__(status_code=status_code, detail={"code": code, "message": detail})


# ── Auth ──────────────────────────────────────────────────────────────────────

class InvalidCredentials(AppError):
    def __init__(self) -> None:
        super().__init__(status.HTTP_401_UNAUTHORIZED, "INVALID_CREDENTIALS", "Invalid email or password")


class TokenExpired(AppError):
    def __init__(self) -> None:
        super().__init__(status.HTTP_401_UNAUTHORIZED, "TOKEN_EXPIRED", "Token has expired")


class Unauthorized(AppError):
    def __init__(self, msg: str = "Authentication required") -> None:
        super().__init__(status.HTTP_401_UNAUTHORIZED, "UNAUTHORIZED", msg)


class Forbidden(AppError):
    def __init__(self, msg: str = "Permission denied") -> None:
        super().__init__(status.HTTP_403_FORBIDDEN, "FORBIDDEN", msg)


# ── User / KYC ────────────────────────────────────────────────────────────────

class UserNotFound(AppError):
    def __init__(self) -> None:
        super().__init__(status.HTTP_404_NOT_FOUND, "USER_NOT_FOUND", "User not found")


class EmailAlreadyExists(AppError):
    def __init__(self) -> None:
        super().__init__(status.HTTP_409_CONFLICT, "EMAIL_EXISTS", "Email already registered")


class PhoneAlreadyExists(AppError):
    def __init__(self) -> None:
        super().__init__(status.HTTP_409_CONFLICT, "PHONE_EXISTS", "Phone already registered")


class AccountSuspended(AppError):
    def __init__(self) -> None:
        super().__init__(status.HTTP_403_FORBIDDEN, "ACCOUNT_SUSPENDED", "Account is suspended")


class KYCRequired(AppError):
    def __init__(self, required_tier: str = "TIER_1") -> None:
        super().__init__(
            status.HTTP_403_FORBIDDEN,
            "KYC_REQUIRED",
            f"KYC {required_tier} required for this action",
        )


class OTPInvalid(AppError):
    def __init__(self) -> None:
        super().__init__(status.HTTP_400_BAD_REQUEST, "OTP_INVALID", "OTP is invalid or expired")


class OTPMaxAttempts(AppError):
    def __init__(self) -> None:
        super().__init__(
            status.HTTP_429_TOO_MANY_REQUESTS, "OTP_MAX_ATTEMPTS", "Maximum OTP attempts reached"
        )


# ── Transactions ──────────────────────────────────────────────────────────────

class InsufficientFunds(AppError):
    def __init__(self) -> None:
        super().__init__(status.HTTP_400_BAD_REQUEST, "INSUFFICIENT_FUNDS", "Insufficient funds")


class TransactionLimitExceeded(AppError):
    def __init__(self, limit_type: str = "daily") -> None:
        super().__init__(
            status.HTTP_400_BAD_REQUEST,
            "TRANSACTION_LIMIT_EXCEEDED",
            f"Transaction exceeds your {limit_type} limit",
        )


class DuplicateTransaction(AppError):
    def __init__(self) -> None:
        super().__init__(
            status.HTTP_409_CONFLICT, "DUPLICATE_TRANSACTION", "Duplicate idempotency key"
        )


class WalletFrozen(AppError):
    def __init__(self) -> None:
        super().__init__(status.HTTP_403_FORBIDDEN, "WALLET_FROZEN", "Wallet is frozen")
