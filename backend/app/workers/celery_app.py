from celery import Celery

from app.config import settings

celery_app = Celery(
    "frenzpay",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.workers.kyc_tasks",
        "app.workers.notification_tasks",
        "app.workers.reconciliation",
        "app.workers.webhook_retry",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,          # Only ack after task completes (safe for money ops)
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,  # One task at a time per worker
    beat_schedule={
        "daily-reconciliation": {
            "task": "app.workers.reconciliation.daily_reconciliation",
            "schedule": "0 2 * * *",  # 2am UTC daily
        },
    },
)
