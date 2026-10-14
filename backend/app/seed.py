"""Idempotent seed: ensures the initial ADMIN user exists.

Run via `python -m app.seed`. Safe to run on every startup — it only creates the admin
user if no user with that email already exists; it never overwrites an existing user.
"""

import logging

from app.auth.security import hash_password
from app.config import get_settings
from app.database.session import SessionLocal
from app.models.enums import UserRole
from app.models.user import User

logger = logging.getLogger("cartuga.seed")


def seed_admin_user() -> None:
    settings = get_settings()
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == settings.initial_admin_email).first()
        if existing is not None:
            logger.info("Admin user already exists, skipping seed.")
            return

        admin = User(
            name=settings.initial_admin_name,
            email=settings.initial_admin_email,
            password_hash=hash_password(settings.initial_admin_password),
            photo=None,
            role=UserRole.ADMIN,
        )
        db.add(admin)
        db.commit()
        logger.info("Created initial admin user: %s", settings.initial_admin_email)
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    seed_admin_user()
