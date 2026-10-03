from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "SchoolOS API"
    ENV: str = "dev"  # dev | test | prod

    DATABASE_URL: str = "sqlite:///./dev.db"
    REDIS_URL: str = "redis://localhost:6379/0"

    # PostgreSQL connection pool (per API/worker process; size for N replicas
    # so N * (pool + overflow) stays under max_connections).
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20

    # Logging: LOG_FORMAT=text (dev) | json (prod aggregation).
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "text"

    # Comma-separated queues this worker drains: default, elab.
    # General workers run "default"; E-Lab workers run "elab" on isolated hosts.
    WORKER_QUEUES: str = "default,elab"

    SECRET_KEY: str = "dev-secret-change-me"
    ACCESS_TOKEN_MINUTES: int = 15
    REFRESH_TOKEN_DAYS: int = 7
    PASSWORD_RESET_MINUTES: int = 30
    EMAIL_VERIFY_HOURS: int = 48
    BCRYPT_ROUNDS: int = 12

    API_BASE_URL: str = "http://localhost:8000"
    FRONTEND_URL: str = "http://localhost:5173"
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    RATE_LIMIT_PER_MINUTE: int = 300

    STORAGE_BACKEND: str = "local"  # local | s3
    STORAGE_LOCAL_DIR: str = "./storage"
    S3_ENDPOINT_URL: str | None = None
    S3_BUCKET: str = "schoolos"
    S3_REGION: str = "us-east-1"
    S3_ACCESS_KEY: str | None = None
    S3_SECRET_KEY: str | None = None
    MAX_UPLOAD_MB: int = 25

    ELAB_TIMEOUT_SECONDS: int = 5
    ELAB_MAX_OUTPUT_KB: int = 64
    ELAB_MAX_SOURCE_KB: int = 100
    ELAB_MAX_STDIN_KB: int = 32
    ELAB_LANGUAGES: str = "python,javascript,c,cpp"

    # Execution backend: "docker" runs every snippet in a short-lived,
    # locked-down container; "local" executes on the worker host and is
    # NEVER allowed unless ELAB_ALLOW_INSECURE_LOCAL is also true
    # (single-process dev / test suites without a Docker daemon only).
    ELAB_BACKEND: str = "docker"
    ELAB_ALLOW_INSECURE_LOCAL: bool = False

    # Container resource envelope (also mirrored by the local backend's rlimits).
    ELAB_MEMORY_MB: int = 256
    ELAB_CPU_QUOTA: int = 50000  # microseconds per 100ms period = 0.5 CPU
    ELAB_PIDS_LIMIT: int = 64

    # One execution image per language; add languages by adding images.
    ELAB_IMAGE_PYTHON: str = "schoolos/elab-python:1.0"
    ELAB_IMAGE_JAVASCRIPT: str = "schoolos/elab-node:1.0"
    ELAB_IMAGE_C: str = "schoolos/elab-gcc:1.0"
    ELAB_IMAGE_CPP: str = "schoolos/elab-gcc:1.0"

    # Source retention: hashes are always kept; source/stdin are scrubbed
    # after execution unless retention is explicitly enabled.
    ELAB_RETAIN_SOURCE: bool = False
    ELAB_SOURCE_RETENTION_DAYS: int = 30

    # Abuse protection (HTTP 429 when exceeded).
    ELAB_MAX_CONCURRENT_PER_USER: int = 3
    ELAB_DAILY_RUNS_PER_USER: int = 100
    ELAB_DAILY_RUNS_PER_TENANT: int = 5000

    EMAIL_BACKEND: str = "console"

    # Supabase presence feed (school-os islands). When unset, the feed-token
    # exchange returns 501 and the islands render their not-configured state.
    SUPABASE_URL: str | None = None
    SUPABASE_SERVICE_KEY: str | None = None

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def elab_languages(self) -> list[str]:
        return [l.strip().lower() for l in self.ELAB_LANGUAGES.split(",") if l.strip()]

    @property
    def is_prod(self) -> bool:
        return self.ENV == "prod"


settings = Settings()
