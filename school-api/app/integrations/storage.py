from __future__ import annotations

import os
from typing import Protocol

from app.core.config import settings
from app.core.errors import StorageError


class StorageBackend(Protocol):
    def put_object(self, key: str, data: bytes, mime: str) -> None: ...
    def get_object(self, key: str) -> bytes: ...
    def delete_object(self, key: str) -> None: ...
    def object_exists(self, key: str) -> bool: ...
    def presign_put(self, key: str, mime: str, expires_in: int) -> str | None: ...
    def presign_get(self, key: str, expires_in: int) -> str | None: ...


class LocalBackend:
    """Filesystem backend for local dev and tests. Never used in production."""

    def __init__(self, root: str):
        self.root = os.path.abspath(root)
        os.makedirs(self.root, exist_ok=True)

    def _path(self, key: str) -> str:
        if ".." in key.replace("\\", "/").split("/"):
            raise StorageError("Invalid object key.")
        return os.path.join(self.root, key)

    def put_object(self, key: str, data: bytes, mime: str) -> None:
        path = self._path(key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)

    def get_object(self, key: str) -> bytes:
        try:
            with open(self._path(key), "rb") as f:
                return f.read()
        except FileNotFoundError:
            raise StorageError("Object not found.")

    def delete_object(self, key: str) -> None:
        try:
            os.remove(self._path(key))
        except FileNotFoundError:
            pass

    def object_exists(self, key: str) -> bool:
        return os.path.exists(self._path(key))

    def presign_put(self, key: str, mime: str, expires_in: int) -> str | None:
        return None

    def presign_get(self, key: str, expires_in: int) -> str | None:
        return None


class S3Backend:
    """S3-compatible backend (AWS S3, MinIO). Credentials stay server-side;
    clients only ever see short-lived presigned URLs."""

    def __init__(self):
        try:
            import boto3
        except ImportError as e:  # pragma: no cover
            raise StorageError("boto3 is required for the S3 backend.") from e
        self.bucket = settings.S3_BUCKET
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            region_name=settings.S3_REGION,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
        )
        self._ensure_bucket()

    def _ensure_bucket(self) -> None:
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except Exception:
            try:
                kwargs = {"Bucket": self.bucket}
                if settings.S3_REGION != "us-east-1" and not settings.S3_ENDPOINT_URL:
                    kwargs["CreateBucketConfiguration"] = {"LocationConstraint": settings.S3_REGION}
                self.client.create_bucket(**kwargs)
            except Exception as e:
                raise StorageError(f"Could not access storage bucket: {e}")

    def _wrap(self, fn, *args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except StorageError:
            raise
        except Exception as e:
            raise StorageError(f"Storage operation failed: {e}")

    def put_object(self, key: str, data: bytes, mime: str) -> None:
        self._wrap(self.client.put_object, Bucket=self.bucket, Key=key, Body=data, ContentType=mime)

    def get_object(self, key: str) -> bytes:
        resp = self._wrap(self.client.get_object, Bucket=self.bucket, Key=key)
        return resp["Body"].read()

    def delete_object(self, key: str) -> None:
        self._wrap(self.client.delete_object, Bucket=self.bucket, Key=key)

    def object_exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except Exception:
            return False

    def presign_put(self, key: str, mime: str, expires_in: int) -> str | None:
        return self._wrap(
            self.client.generate_presigned_url,
            "put_object",
            Params={"Bucket": self.bucket, "Key": key, "ContentType": mime},
            ExpiresIn=expires_in,
        )

    def presign_get(self, key: str, expires_in: int) -> str | None:
        return self._wrap(
            self.client.generate_presigned_url,
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=expires_in,
        )


_backend: StorageBackend | None = None


def get_storage() -> StorageBackend:
    global _backend
    if _backend is None:
        if settings.STORAGE_BACKEND == "s3":
            _backend = S3Backend()
        else:
            _backend = LocalBackend(settings.STORAGE_LOCAL_DIR)
    return _backend


def reset_storage() -> None:
    global _backend
    _backend = None
