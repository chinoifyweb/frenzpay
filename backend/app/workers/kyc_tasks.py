import logging

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.workers.kyc_tasks.process_dojah_webhook", bind=True, max_retries=3)
def process_dojah_webhook(self, event: dict):
    import asyncio
    try:
        asyncio.run(_handle_dojah_event(event))
    except Exception as exc:
        logger.error(f"Dojah webhook failed: {exc}")
        raise self.retry(exc=exc, countdown=30)


async def _handle_dojah_event(event: dict):
    from sqlalchemy.future import select
    from app.database import AsyncSessionLocal
    from app.models.kyc import KYCSubmission, KYCSubmissionStatus

    event_type = event.get("type", "")
    reference = event.get("reference", "")

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(KYCSubmission).where(KYCSubmission.provider_reference == reference)
        )
        submission = result.scalar_one_or_none()
        if not submission:
            logger.warning(f"Dojah webhook for unknown submission: {reference}")
            return

        if event_type == "kyc.verified":
            from datetime import UTC, datetime
            submission.status = KYCSubmissionStatus.VERIFIED
            submission.verified_at = datetime.now(UTC)
        elif event_type == "kyc.rejected":
            submission.status = KYCSubmissionStatus.REJECTED
            submission.rejection_reason = event.get("reason", "")

        await db.commit()
