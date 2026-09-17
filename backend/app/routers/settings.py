"""Gym settings: name, logo, contact details, receipt footer, defaults."""
from fastapi import APIRouter, File, Response, UploadFile

from app.deps import AdminUser, CurrentUser, DbSession, get_gym, get_gym_settings
from app.errors import NotFound
from app.schemas.common import MessageOut
from app.schemas.misc import GymSettingsIn, GymSettingsOut
from app.services.images import process_photo
from app.services.storage import get_storage, new_key

router = APIRouter(prefix="/settings", tags=["settings"])

GYM_FIELDS = {"name", "address", "phone", "email", "whatsapp_number"}


def _serialize(gym, row) -> GymSettingsOut:
    return GymSettingsOut(
        gym_id=gym.id, name=gym.name, address=gym.address, phone=gym.phone,
        email=gym.email, whatsapp_number=gym.whatsapp_number,
        has_logo=bool(gym.logo_key), currency=row.currency,
        timezone=row.timezone, receipt_footer=row.receipt_footer,
        default_plan_id=row.default_plan_id,
        expiring_soon_days=row.expiring_soon_days,
        open_time=row.open_time, close_time=row.close_time,
        member_code_prefix=row.member_code_prefix,
        receipt_prefix=row.receipt_prefix,
    )


@router.get("", response_model=GymSettingsOut)
def read_settings(user: CurrentUser, db: DbSession):
    return _serialize(get_gym(db, user.gym_id), get_gym_settings(db, user.gym_id))


@router.put("", response_model=GymSettingsOut)
def update_settings(payload: GymSettingsIn, admin: AdminUser, db: DbSession):
    gym = get_gym(db, admin.gym_id)
    row = get_gym_settings(db, admin.gym_id)

    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is None and field not in ("open_time", "close_time",
                                           "default_plan_id"):
            continue
        target = gym if field in GYM_FIELDS else row
        setattr(target, field, value)

    db.commit()
    db.refresh(gym)
    db.refresh(row)
    return _serialize(gym, row)


@router.post("/logo", response_model=MessageOut)
async def upload_logo(admin: AdminUser, db: DbSession,
                      file: UploadFile = File(...)):
    gym = get_gym(db, admin.gym_id)
    # Logos get more pixels than member photos - they are printed on receipts.
    data, content_type = process_photo(await file.read(), file.content_type,
                                       max_dimension=600)
    storage = get_storage()
    old_key = gym.logo_key
    key = new_key(f"gym-{gym.id}/branding")
    storage.save(key, data, content_type)
    gym.logo_key = key
    db.commit()
    if old_key:
        storage.delete(old_key)
    return MessageOut(message="Logo updated.")


@router.get("/logo")
def get_logo(user: CurrentUser, db: DbSession):
    gym = get_gym(db, user.gym_id)
    if not gym.logo_key:
        raise NotFound("logo")
    return Response(content=get_storage().load(gym.logo_key),
                    media_type="image/jpeg",
                    headers={"Cache-Control": "private, max-age=3600"})


@router.delete("/logo", response_model=MessageOut)
def delete_logo(admin: AdminUser, db: DbSession):
    gym = get_gym(db, admin.gym_id)
    if gym.logo_key:
        get_storage().delete(gym.logo_key)
        gym.logo_key = None
        db.commit()
    return MessageOut(message="Logo removed.")
