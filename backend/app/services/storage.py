"""Pluggable object storage for member/staff photos and the gym logo.

Local disk in development, Google Cloud Storage in production. Object keys are
random UUIDs and the bucket stays private - photos are only reachable through an
authenticated API endpoint, never a guessable public URL.
"""
from __future__ import annotations

import os
import uuid
from abc import ABC, abstractmethod
from pathlib import Path

from app.config import settings
from app.errors import AppError


def new_key(prefix: str, ext: str = "jpg") -> str:
    return f"{prefix}/{uuid.uuid4().hex}.{ext.lstrip('.')}"


class Storage(ABC):
    @abstractmethod
    def save(self, key: str, data: bytes, content_type: str) -> str: ...

    @abstractmethod
    def load(self, key: str) -> bytes: ...

    @abstractmethod
    def delete(self, key: str) -> None: ...


class LocalStorage(Storage):
    """Development backend. Files live under STORAGE_LOCAL_DIR."""

    def __init__(self, root: str):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        # Defend against '../' in a key reaching the filesystem.
        target = (self.root / key).resolve()
        if not str(target).startswith(str(self.root)):
            raise AppError("Invalid file reference.")
        return target

    def save(self, key: str, data: bytes, content_type: str) -> str:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return key

    def load(self, key: str) -> bytes:
        path = self._path(key)
        if not path.exists():
            raise AppError("That image is no longer available.", 404)
        return path.read_bytes()

    def delete(self, key: str) -> None:
        try:
            self._path(key).unlink(missing_ok=True)
        except OSError:
            pass


class GCSStorage(Storage):
    """Production backend. The bucket must stay private (uniform access, no
    allUsers reader); we stream bytes through the authenticated API."""

    def __init__(self, bucket_name: str):
        try:
            from google.cloud import storage as gcs  # imported lazily
        except ImportError as exc:  # pragma: no cover - depends on deployment
            raise AppError(
                "Cloud storage is not available. Install google-cloud-storage."
            ) from exc
        if not bucket_name:
            raise AppError("STORAGE_BUCKET is not configured.")
        self._client = gcs.Client()
        self._bucket = self._client.bucket(bucket_name)

    def save(self, key: str, data: bytes, content_type: str) -> str:
        blob = self._bucket.blob(key)
        blob.cache_control = "private, max-age=86400"
        blob.upload_from_string(data, content_type=content_type)
        return key

    def load(self, key: str) -> bytes:
        blob = self._bucket.blob(key)
        if not blob.exists():
            raise AppError("That image is no longer available.", 404)
        return blob.download_as_bytes()

    def delete(self, key: str) -> None:
        try:
            self._bucket.blob(key).delete()
        except Exception:  # pragma: no cover - best effort cleanup
            pass


_storage: Storage | None = None


def get_storage() -> Storage:
    global _storage
    if _storage is None:
        if settings.STORAGE_BACKEND == "gcs":
            _storage = GCSStorage(settings.STORAGE_BUCKET)
        else:
            _storage = LocalStorage(settings.STORAGE_LOCAL_DIR)
    return _storage


def reset_storage() -> None:
    """Used by tests to pick up a changed configuration."""
    global _storage
    _storage = None
