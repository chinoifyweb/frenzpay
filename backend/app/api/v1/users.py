from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import CurrentUser, get_db
from app.core.exceptions import InvalidCredentials
from app.core.security import hash_password, verify_password
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
