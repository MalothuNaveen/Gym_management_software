"""First-run bootstrap: create the gym, its settings, the owner login and a
starter set of membership plans.

Safe to run repeatedly - it only ever fills in what is missing.
"""
import logging
from datetime import time
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings as cfg
from app.models import Gym, GymSettings, MembershipPlan, User
from app.security import hash_password

logger = logging.getLogger("gym")

DEFAULT_PLANS = [
    ("Monthly", Decimal("1000.00"), 30, 1),
    ("3 Months", Decimal("2500.00"), 90, 2),
    ("6 Months", Decimal("4500.00"), 180, 3),
    ("12 Months", Decimal("7500.00"), 365, 4),
]


def seed(db: Session) -> Gym:
    gym = db.scalar(select(Gym).order_by(Gym.id).limit(1))
    if gym is None:
        gym = Gym(
            name=cfg.GYM_NAME,
            phone=cfg.GYM_PHONE or None,
            address=cfg.GYM_ADDRESS or None,
        )
        db.add(gym)
        db.flush()
        logger.info("Created gym '%s'", gym.name)

    row = db.scalar(select(GymSettings).where(GymSettings.gym_id == gym.id))
    if row is None:
        row = GymSettings(
            gym_id=gym.id,
            timezone=cfg.GYM_TIMEZONE,
            open_time=time(6, 0),
            close_time=time(22, 0),
        )
        db.add(row)
        db.flush()

    owner = db.scalar(
        select(User).where(func.lower(User.email) == cfg.OWNER_EMAIL.lower())
    )
    if owner is None and db.scalar(select(func.count(User.id))) == 0:
        owner = User(
            gym_id=gym.id,
            full_name=cfg.OWNER_NAME,
            email=cfg.OWNER_EMAIL.lower(),
            password_hash=hash_password(cfg.OWNER_PASSWORD),
            role="owner",
        )
        db.add(owner)
        logger.info("Created owner account %s", cfg.OWNER_EMAIL)

    if db.scalar(select(func.count(MembershipPlan.id)).where(
            MembershipPlan.gym_id == gym.id)) == 0:
        for name, price, days, order in DEFAULT_PLANS:
            db.add(MembershipPlan(gym_id=gym.id, name=name, price=price,
                                  duration_days=days, sort_order=order))
        logger.info("Created %d starter membership plans", len(DEFAULT_PLANS))

    db.commit()
    return gym
