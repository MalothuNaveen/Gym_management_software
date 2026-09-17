"""Database engine, session factory and FastAPI session dependency."""
from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings


def _build_engine() -> Engine:
    url = settings.DATABASE_URL
    kwargs: dict = {"pool_pre_ping": True, "future": True}

    if url.startswith("sqlite"):
        # SQLite is the zero-setup local/test fallback.
        kwargs["connect_args"] = {"check_same_thread": False}
    else:
        # Serverless Postgres (Neon) drops idle connections aggressively.
        kwargs.update(pool_size=5, max_overflow=5, pool_recycle=280)

    return create_engine(url, **kwargs)


engine = _build_engine()

SessionLocal = sessionmaker(
    bind=engine, autocommit=False, autoflush=False, expire_on_commit=False,
    class_=Session, future=True,
)


@event.listens_for(Engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, connection_record) -> None:
    """SQLite ignores foreign keys unless explicitly told not to."""
    if settings.DATABASE_URL.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: one session per request, always closed."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
