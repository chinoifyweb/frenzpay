from fastapi import APIRouter, BackgroundTasks, Depends

from app.core.dependencies import CurrentUser, get_db
from app.database import get_db
from app.integrations.dojah.client import dojah
from app.models.kyc import (
    AMLScreening,
    DocumentType,
    KYCDocument,
    KYCLivenessCheck,
    KYCProvider,
    KYCSubmission,
    KYCSubmissionStatus,
    KYCTierLevel,
    ScreeningResult,
    ScreeningType,
)
from app.models.user import KYCStatus, KYCTier
from app.schemas.kyc import (
    BVNVerifyRequest,
    DocumentUploadRequest,
    KYCStatusResponse,
    NINVerifyRequest,
    SelfieVerifyRequest,
)

router = APIRouter(prefix="/kyc", tags=["kyc"])


@router.get("/status", response_model=KYCStatusResponse)
async def get_kyc_status(user: CurrentUser, db=Depends(get_db)):
    from sqlalchemy.future import select
    result = await db.execute(
        select(KYCSubmission)
        .where(KYCSubmission.user_id == user.id)
        .order_by(KYCSubmission.submitted_at.desc())
    )
    submissions = result.scalars().all()
    return KYCStatusResponse(
        kyc_tier=user.kyc_tier.value,
        kyc_status=user.kyc_status.value,
        submissions=submissions,
    )


@router.post("/tier1/bvn")
async def verify_bvn(
    data: BVNVerifyRequest,
    user: CurrentUser,
    background: BackgroundTasks,
    db=Depends(get_db),
):
    """
    Step 1 of Tier 1 KYC: lookup BVN and match against registration data.
    """
    submission = KYCSubmission(
        user_id=user.id,
        tier=KYCTierLevel.TIER_1,
        status=KYCSubmissionStatus.PENDING,
        provider=KYCProvider.DOJAH,
    )
    db.add(submission)
    await db.flush()

    try:
        bvn_data = await dojah.verify_bvn(data.bvn)

        # Basic name match check
        bvn_first = bvn_data.first_name.lower()
        bvn_last = bvn_data.last_name.lower()
        reg_first = user.first_name.lower()
        reg_last = user.last_name.lower()

        if bvn_first not in reg_first and reg_first not in bvn_first:
            submission.status = KYCSubmissionStatus.REJECTED
            submission.rejection_reason = "Name mismatch with BVN records"
            submission.raw_response = bvn_data.raw
            return {"status": "rejected", "reason": "Name mismatch"}

        # Store the encrypted document number
        from app.core.security import encrypt_pii
        doc = KYCDocument(
            submission_id=submission.id,
            document_type=DocumentType.BVN,
            document_number=encrypt_pii(data.bvn),
            verification_status="VERIFIED",
            extracted_data={
                "full_name": f"{bvn_data.first_name} {bvn_data.last_name}",
                "dob": bvn_data.dob,
                "phone": bvn_data.phone,
            },
        )
        db.add(doc)
        submission.raw_response = bvn_data.raw

        return {
            "status": "success",
            "submission_id": str(submission.id),
            "message": "BVN verified. Please proceed to selfie verification.",
        }

    except Exception as e:
        submission.status = KYCSubmissionStatus.REJECTED
        submission.rejection_reason = str(e)
        raise


@router.post("/tier1/nin")
async def verify_nin(
    data: NINVerifyRequest,
    user: CurrentUser,
    db=Depends(get_db),
):
    """Tier 1 KYC via NIN instead of BVN."""
    submission = KYCSubmission(
        user_id=user.id,
        tier=KYCTierLevel.TIER_1,
        status=KYCSubmissionStatus.PENDING,
        provider=KYCProvider.DOJAH,
    )
    db.add(submission)
    await db.flush()

    try:
        nin_data = await dojah.verify_nin(data.nin)

        from app.core.security import encrypt_pii
        doc = KYCDocument(
            submission_id=submission.id,
            document_type=DocumentType.NIN,
            document_number=encrypt_pii(data.nin),
            verification_status="VERIFIED",
            extracted_data={
                "full_name": f"{nin_data.first_name} {nin_data.last_name}",
                "dob": nin_data.dob,
            },
        )
        db.add(doc)
        submission.raw_response = nin_data.raw

        return {
            "status": "success",
            "submission_id": str(submission.id),
            "message": "NIN verified. Please proceed to selfie verification.",
        }

    except Exception as e:
        submission.status = KYCSubmissionStatus.REJECTED
        submission.rejection_reason = str(e)
        raise


@router.post("/tier1/selfie")
async def verify_selfie(
    data: SelfieVerifyRequest,
    user: CurrentUser,
    db=Depends(get_db),
):
    """Selfie + liveness check — final step for Tier 1."""
    from sqlalchemy.future import select

    # Find the most recent pending submission
    result = await db.execute(
        select(KYCSubmission)
        .where(
            KYCSubmission.user_id == user.id,
            KYCSubmission.status == KYCSubmissionStatus.PENDING,
        )
        .order_by(KYCSubmission.submitted_at.desc())
        .limit(1)
    )
    submission = result.scalar_one_or_none()
    if not submission:
        from fastapi import HTTPException
        raise HTTPException(400, "No pending KYC submission found")

    # Get reference photo from stored BVN/NIN response
    reference_photo = submission.raw_response.get("image", "") if submission.raw_response else ""

    liveness = await dojah.liveness_check(data.selfie_base64)
    selfie_match = await dojah.verify_selfie(data.selfie_base64, reference_photo) if reference_photo else None

    liveness_record = KYCLivenessCheck(
        submission_id=submission.id,
        passed=liveness.passed,
        confidence_score=liveness.confidence,
        raw_response=liveness.raw,
    )
    db.add(liveness_record)

    if not liveness.passed:
        submission.status = KYCSubmissionStatus.REJECTED
        submission.rejection_reason = "Liveness check failed"
        return {"status": "rejected", "reason": "Liveness check failed"}

    if selfie_match and not selfie_match.match:
        submission.status = KYCSubmissionStatus.REJECTED
        submission.rejection_reason = "Selfie does not match ID photo"
        return {"status": "rejected", "reason": "Selfie mismatch"}

    # Run AML screening
    from datetime import datetime
    aml = await dojah.aml_screening(user.first_name, user.last_name, "")

    if aml.is_sanctioned:
        submission.status = KYCSubmissionStatus.REJECTED
        submission.rejection_reason = "AML sanctions check failed"
        return {"status": "rejected", "reason": "AML check failed"}

    if aml.is_pep:
        # Flag for manual review, don't auto-reject PEPs
        user.kyc_status = KYCStatus.IN_REVIEW
        submission.status = KYCSubmissionStatus.PENDING
        return {"status": "in_review", "message": "Account flagged for manual review"}

    # Promote to Tier 1
    from datetime import UTC
    submission.status = KYCSubmissionStatus.VERIFIED
    submission.verified_at = datetime.now(UTC)
    user.kyc_tier = KYCTier.TIER_1
    user.kyc_status = KYCStatus.APPROVED

    # Provision wallets + Graph customer + virtual accounts
    from app.services.wallet_service import provision_tier1_wallets
    await provision_tier1_wallets(user, db)

    return {
        "status": "approved",
        "kyc_tier": "TIER_1",
        "message": "KYC Tier 1 approved. Your wallets have been created.",
    }
