"""FastAPI application entrypoint."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.config import settings
from app.db import SessionLocal, engine
from app.errors import register_error_handlers
from app.models import Base
from app.routers import (
    attendance, auth, dashboard, expenses, members, payments, plans, reports,
)
from app.routers import settings as settings_router
from app.routers import staff
from app.seed import seed

logging.basicConfig(
    level=logging.INFO if settings.is_production else logging.DEBUG,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("gym")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # On SQLite (local/dev) the schema is created directly; on PostgreSQL the
    # tables come from `alembic upgrade head`, which runs before the server.
    if settings.DATABASE_URL.startswith("sqlite"):
        Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        try:
            seed(db)
        except Exception:
            logger.exception("Could not complete first-run setup")
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="Private management system for a single gym.",
    lifespan=lifespan,
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
    openapi_url=None if settings.is_production else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,       # we use Bearer tokens, not cookies
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["Content-Disposition"],
    max_age=3600,
)
app.add_middleware(GZipMiddleware, minimum_size=1024)

register_error_handlers(app)

API_PREFIX = "/api"
for module in (auth, dashboard, members, plans, payments, attendance, staff,
               expenses, reports, settings_router):
    app.include_router(module.router, prefix=API_PREFIX)


@app.get("/health", tags=["system"])
def health():
    """Used by Cloud Run and uptime checks."""
    return {"status": "ok", "app": settings.APP_NAME}


@app.get("/", include_in_schema=False)
def root():
    return {"name": settings.APP_NAME, "docs": "/docs" if not settings.is_production
            else None}
