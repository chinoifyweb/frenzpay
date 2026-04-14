from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_ENV: str = "development"
    APP_SECRET_KEY: str = "change-me-in-production"
    APP_URL: str = "https://frenzpay.co"
    API_URL: str = "https://api.frenzpay.co"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://frenzpay:frenzpay@localhost:5432/frenzpay"
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    JWT_SECRET: str = "change-me-in-production"
    JWT_ACCESS_TTL_MINUTES: int = 15
    JWT_REFRESH_TTL_DAYS: int = 7
    JWT_ALGORITHM: str = "HS256"

    # PII encryption — 32-byte key, base64-encoded
    ENCRYPTION_KEY: str = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="

    # Graph (payment rails)
    GRAPH_API_KEY: str = ""
    GRAPH_API_URL: str = "https://api.graph.finance"
    GRAPH_WEBHOOK_SECRET: str = ""

    # Dojah (KYC)
    DOJAH_APP_ID: str = ""
    DOJAH_PUBLIC_KEY: str = ""
    DOJAH_PRIVATE_KEY: str = ""
    DOJAH_WEBHOOK_SECRET: str = ""

    # Termii (SMS/OTP)
    TERMII_API_KEY: str = ""
    TERMII_SENDER_ID: str = "FrenzPay"

    # Resend (email)
    RESEND_API_KEY: str = ""
    FROM_EMAIL: str = "hello@frenzpay.co"

    # Monitoring
    SENTRY_DSN: str = ""

    # Alerts
    ADMIN_ALERT_TELEGRAM_BOT_TOKEN: str = ""
    ADMIN_ALERT_CHAT_ID: str = ""

    # OTP
    OTP_TTL_MINUTES: int = 10
    OTP_MAX_ATTEMPTS: int = 5

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "https://frenzpay.co"]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
