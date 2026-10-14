from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings

settings = get_settings()

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_engine() -> Engine:
    """Dependency wrapper around the module-level `engine`, so tests can override it
    (like get_db) to point raw-connection code - e.g. the database import pipeline,
    which needs its own transaction outside the ORM session - at an isolated test DB."""
    return engine
