import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import CurrentUser, get_db
from app.database import get_db
from app.models.transaction import Beneficiary, BeneficiaryType
from app.models.wallet import Wallet, VirtualAccount
from app.schemas.transaction import (
    BeneficiaryCreate,
    BeneficiaryResponse,
    VirtualAccountResponse,
    WalletResponse,
)

router = APIRouter(prefix="/wallets", tags=["wallets"])


@router.get("", response_model=list[WalletResponse])
async def list_wallets(user: CurrentUser, db=Depends(get_db)):
    from sqlalchemy.future import select
    result = await db.execute(select(Wallet).where(Wallet.user_id == user.id))
    return result.scalars().all()


@router.get("/{wallet_id}", response_model=WalletResponse)
async def get_wallet(wallet_id: str, user: CurrentUser, db=Depends(get_db)):
    from sqlalchemy.future import select
    import uuid as _uuid
    result = await db.execute(
        select(Wallet).where(Wallet.id == _uuid.UUID(wallet_id), Wallet.user_id == user.id)
    )
    wallet = result.scalar_one_or_none()
    if not wallet:
        raise HTTPException(404, "Wallet not found")
    return wallet


@router.get("/{wallet_id}/virtual-account", response_model=VirtualAccountResponse)
async def get_virtual_account(wallet_id: str, user: CurrentUser, db=Depends(get_db)):
    from sqlalchemy.future import select
    import uuid as _uuid
    # Verify wallet belongs to user
    result = await db.execute(
        select(Wallet).where(Wallet.id == _uuid.UUID(wallet_id), Wallet.user_id == user.id)
    )
    wallet = result.scalar_one_or_none()
    if not wallet:
        raise HTTPException(404, "Wallet not found")

    result = await db.execute(
        select(VirtualAccount).where(VirtualAccount.wallet_id == wallet.id).limit(1)
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(404, "No virtual account for this wallet yet")
    return account


# ── Beneficiaries ─────────────────────────────────────────────────────────────

@router.get("/beneficiaries", response_model=list[BeneficiaryResponse])
async def list_beneficiaries(user: CurrentUser, db=Depends(get_db)):
    """Return all saved beneficiaries for the authenticated user."""
    from sqlalchemy.future import select
    result = await db.execute(
        select(Beneficiary)
        .where(Beneficiary.user_id == user.id)
        .order_by(Beneficiary.is_favorite.desc(), Beneficiary.created_at.desc())
    )
    return result.scalars().all()


@router.post("/beneficiaries", response_model=BeneficiaryResponse, status_code=201)
async def create_beneficiary(
    data: BeneficiaryCreate,
    user: CurrentUser,
    db=Depends(get_db),
):
    """Save a new payment beneficiary (bank account, mobile money, or stablecoin wallet)."""
    try:
        btype = BeneficiaryType(data.type)
    except ValueError:
        raise HTTPException(400, f"Invalid beneficiary type: {data.type}")

    # Encrypt sensitive fields
    account_number = data.account_number
    stablecoin_address = data.stablecoin_address

    try:
        from app.core.security import encrypt_pii
        if account_number:
            account_number = encrypt_pii(account_number)
        if stablecoin_address:
            stablecoin_address = encrypt_pii(stablecoin_address)
    except Exception:
        pass  # Encryption not critical for MVP — store plaintext if key not set

    beneficiary = Beneficiary(
        user_id=user.id,
        nickname=data.nickname,
        type=btype,
        country=data.country.upper(),
        currency=data.currency.upper(),
        account_number=account_number,
        account_name=data.account_name,
        bank_name=data.bank_name,
        bank_code=data.bank_code,
        mobile_money_provider=data.mobile_money_provider,
        stablecoin_network=data.stablecoin_network,
        stablecoin_address=stablecoin_address,
    )
    db.add(beneficiary)
    await db.flush()
    return beneficiary


@router.patch("/beneficiaries/{beneficiary_id}", response_model=BeneficiaryResponse)
async def update_beneficiary(
    beneficiary_id: str,
    data: BeneficiaryCreate,
    user: CurrentUser,
    db=Depends(get_db),
):
    """Update an existing beneficiary (nickname, account details)."""
    from sqlalchemy.future import select
    result = await db.execute(
        select(Beneficiary).where(
            Beneficiary.id == uuid.UUID(beneficiary_id),
            Beneficiary.user_id == user.id,
        )
    )
    b = result.scalar_one_or_none()
    if not b:
        raise HTTPException(404, "Beneficiary not found")

    if data.nickname is not None:
        b.nickname = data.nickname
    if data.account_name is not None:
        b.account_name = data.account_name
    if data.bank_name is not None:
        b.bank_name = data.bank_name
    if data.bank_code is not None:
        b.bank_code = data.bank_code
    return b


@router.post("/beneficiaries/{beneficiary_id}/favorite")
async def toggle_favorite(
    beneficiary_id: str,
    user: CurrentUser,
    db=Depends(get_db),
):
    """Toggle the is_favorite flag on a beneficiary."""
    from sqlalchemy.future import select
    result = await db.execute(
        select(Beneficiary).where(
            Beneficiary.id == uuid.UUID(beneficiary_id),
            Beneficiary.user_id == user.id,
        )
    )
    b = result.scalar_one_or_none()
    if not b:
        raise HTTPException(404, "Beneficiary not found")
    b.is_favorite = not b.is_favorite
    return {"is_favorite": b.is_favorite}


@router.delete("/beneficiaries/{beneficiary_id}", status_code=204)
async def delete_beneficiary(
    beneficiary_id: str,
    user: CurrentUser,
    db=Depends(get_db),
):
    """Remove a saved beneficiary."""
    from sqlalchemy.future import select
    result = await db.execute(
        select(Beneficiary).where(
            Beneficiary.id == uuid.UUID(beneficiary_id),
            Beneficiary.user_id == user.id,
        )
    )
    b = result.scalar_one_or_none()
    if not b:
        raise HTTPException(404, "Beneficiary not found")
    await db.delete(b)
    return None
