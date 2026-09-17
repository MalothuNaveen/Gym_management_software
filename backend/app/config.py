"""Application configuration, loaded from environment variables."""
from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # --- Environment ---
    APP_ENV: Literal["development", "production", "test"] = "development"
    APP_NAME: str = "Gym Management System"

    # --- Database -----------------------------------------------------------
    # Production (Neon):
    #   postgresql+psycopg://user:pass@host/dbname?sslmode=require
    # Local development fallback: file-backed SQLite, no server required.
    DATABASE_URL: str = "sqlite:///./gym.db"

    # --- Security -----------------------------------------------------------
    JWT_SECRET: str = "change-me-in-production"
    # Work factor for password hashing. 12 is the production default; the test
    # suite lowers it so the suite does not spend minutes hashing.
    BCRYPT_ROUNDS: int = 12
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 12  # 12h - a full working day

    # Comma-separated list of allowed browser origins.
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- First-run owner account (seeded once) ------------------------------
    OWNER_EMAIL: str = "owner@gym.local"
    OWNER_PASSWORD: str = "ChangeMe123!"
    OWNER_NAME: str = "Gym Owner"

    # --- Gym defaults (seeded once, editable later in Settings) -------------
    GYM_NAME: str = "Iron Fitness Gym"
    GYM_PHONE: str = ""
    GYM_ADDRESS: str = ""
    GYM_TIMEZONE: str = "Asia/Kolkata"

    # --- Storage ------------------------------------------------------------
    STORAGE_BACKEND: Literal["local", "gcs"] = "local"
    STORAGE_LOCAL_DIR: str = "./uploads"
    STORAGE_BUCKET: str = ""
    # Path to a service-account JSON key. On Cloud Run leave empty and rely on
    # the attached service account (Application Default Credentials).
    GOOGLE_APPLICATION_CREDENTIALS: str = ""

    # --- Uploads ------------------------------------------------------------
    MAX_UPLOAD_BYTES: int = 8 * 1024 * 1024  # 8 MB before compression
    PHOTO_MAX_DIMENSION: int = 800           # px, longest side after resize
    PHOTO_JPEG_QUALITY: int = 82

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
