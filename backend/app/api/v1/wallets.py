from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import CurrentUser, get_db
from app.database import get_db
from app.models.wallet import Wallet, VirtualAccount
from app.schemas.transaction import VirtualAccountResponse, WalletResponse

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
