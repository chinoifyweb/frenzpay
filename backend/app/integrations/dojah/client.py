"""
Dojah KYC client (stub with real API shape).
Replace raise NotImplementedError stubs with real HTTP calls once you have API keys.
Documentation: https://docs.dojah.io
"""

import httpx

from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_BASE_URL = "https://api.dojah.io"


class BVNResponse:
    def __init__(self, data: dict):
        self.first_name: str = data.get("first_name", "")
        self.last_name: str = data.get("last_name", "")
        self.middle_name: str = data.get("middle_name", "")
        self.dob: str = data.get("date_of_birth", "")
        self.phone: str = data.get("phone_number1", "")
        self.photo_base64: str = data.get("image", "")
        self.raw: dict = data


class NINResponse:
    def __init__(self, data: dict):
        self.first_name: str = data.get("firstname", "")
        self.last_name: str = data.get("surname", "")
        self.middle_name: str = data.get("middlename", "")
        self.dob: str = data.get("birthdate", "")
        self.phone: str = data.get("phone", "")
        self.photo_base64: str = data.get("photo", "")
        self.raw: dict = data


class SelfieMatchResponse:
    def __init__(self, data: dict):
        self.match: bool = data.get("match", False)
        self.confidence: float = data.get("confidence", 0.0)
        self.raw: dict = data


class LivenessResponse:
    def __init__(self, data: dict):
        self.passed: bool = data.get("liveness_check", False)
        self.confidence: float = data.get("confidence", 0.0)
        self.raw: dict = data


class AMLResponse:
    def __init__(self, data: dict):
        result = data.get("result", {})
        self.is_pep: bool = bool(result.get("pep", []))
        self.is_sanctioned: bool = bool(result.get("sanction", []))
        self.matches: dict = result
        self.raw: dict = data


class DojahClient:
    def __init__(self) -> None:
        self._app_id = settings.DOJAH_APP_ID
        self._private_key = settings.DOJAH_PRIVATE_KEY

    def _headers(self) -> dict[str, str]:
        return {
            "AppId": self._app_id,
            "Authorization": self._private_key,
            "Content-Type": "application/json",
        }

    async def verify_bvn(self, bvn: str) -> BVNResponse:
        """
        Lookup a BVN and return name, DOB, phone, and photo for matching.
        POST /api/v1/kyc/bvn
        """
        async with httpx.AsyncClient(base_url=_BASE_URL, timeout=30) as client:
            resp = await client.get(
                "/api/v1/kyc/bvn",
                params={"bvn": bvn},
                headers=self._headers(),
            )
            resp.raise_for_status()
            data = resp.json()
            logger.info("BVN verification called", extra={"status": resp.status_code})
            return BVNResponse(data.get("entity", {}))

    async def verify_nin(self, nin: str) -> NINResponse:
        """
        Lookup a NIN.
        GET /api/v1/kyc/nin
        """
        async with httpx.AsyncClient(base_url=_BASE_URL, timeout=30) as client:
            resp = await client.get(
                "/api/v1/kyc/nin",
                params={"nin": nin},
                headers=self._headers(),
            )
            resp.raise_for_status()
            data = resp.json()
            return NINResponse(data.get("entity", {}))

    async def verify_selfie(
        self, selfie_base64: str, reference_photo_base64: str
    ) -> SelfieMatchResponse:
        """
        Compare a live selfie against the ID photo returned from BVN/NIN lookup.
        POST /api/v1/kyc/photoid/verify
        """
        async with httpx.AsyncClient(base_url=_BASE_URL, timeout=60) as client:
            resp = await client.post(
                "/api/v1/kyc/photoid/verify",
                json={
                    "selfie_image": selfie_base64,
                    "photo_id_image": reference_photo_base64,
                },
                headers=self._headers(),
            )
            resp.raise_for_status()
            return SelfieMatchResponse(resp.json().get("entity", {}))

    async def liveness_check(self, selfie_video_base64: str) -> LivenessResponse:
        """
        Check if the provided selfie/video is from a live person (not a spoof).
        POST /api/v1/ml/liveness
        """
        async with httpx.AsyncClient(base_url=_BASE_URL, timeout=60) as client:
            resp = await client.post(
                "/api/v1/ml/liveness",
                json={"image": selfie_video_base64},
                headers=self._headers(),
            )
            resp.raise_for_status()
            return LivenessResponse(resp.json().get("entity", {}))

    async def verify_document(self, doc_type: str, doc_base64: str) -> dict:
        """
        OCR and forgery-check a government ID.
        POST /api/v1/document/analysis
        """
        async with httpx.AsyncClient(base_url=_BASE_URL, timeout=60) as client:
            resp = await client.post(
                "/api/v1/document/analysis",
                json={"doc_type": doc_type.lower(), "image": doc_base64},
                headers=self._headers(),
            )
            resp.raise_for_status()
            return resp.json().get("entity", {})

    async def aml_screening(
        self, first_name: str, last_name: str, dob: str
    ) -> AMLResponse:
        """
        Screen against sanctions, PEP, and adverse media lists.
        POST /api/v1/aml/screening
        """
        async with httpx.AsyncClient(base_url=_BASE_URL, timeout=30) as client:
            resp = await client.post(
                "/api/v1/aml/screening",
                json={"first_name": first_name, "last_name": last_name, "date_of_birth": dob},
                headers=self._headers(),
            )
            resp.raise_for_status()
            return AMLResponse(resp.json())

    async def verify_cac(self, rc_number: str) -> dict:
        """
        Verify a Nigerian CAC (company registration) number for KYB.
        GET /api/v1/kyc/cac
        """
        async with httpx.AsyncClient(base_url=_BASE_URL, timeout=30) as client:
            resp = await client.get(
                "/api/v1/kyc/cac",
                params={"rc_number": rc_number},
                headers=self._headers(),
            )
            resp.raise_for_status()
            return resp.json().get("entity", {})


# Module-level singleton
dojah = DojahClient()
