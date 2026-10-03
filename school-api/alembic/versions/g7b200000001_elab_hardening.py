"""E-Lab hardening: completed/cancelled statuses, compile stage, cancel support.

Revision ID: g7b200000001
Revises: f6a100000001
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "g7b200000001"
down_revision: str | None = "f6a100000001"
branch_labels = None
depends_on = None

NEW_CHECK = "status IN ('queued','running','completed','failed','timeout','cancelled')"
OLD_CHECK = "status IN ('queued','running','succeeded','failed','timeout')"


def _is_sqlite() -> bool:
    return op.get_bind().dialect.name == "sqlite"


def upgrade() -> None:
    if _is_sqlite():
        conn = op.get_bind()
        conn.execute(sa.text("PRAGMA foreign_keys=OFF"))
        conn.execute(sa.text("""
            CREATE TABLE elab_runs_new (
                user_id CHAR(32) NOT NULL,
                language VARCHAR(20) NOT NULL,
                source_code TEXT NOT NULL,
                stdin TEXT NOT NULL,
                status VARCHAR(20) NOT NULL,
                stdout TEXT NOT NULL,
                stderr TEXT NOT NULL,
                exit_code INTEGER,
                runtime_ms INTEGER,
                started_at DATETIME,
                completed_at DATETIME,
                id CHAR(32) NOT NULL,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                tenant_id CHAR(32) NOT NULL,
                source_hash VARCHAR(64) NOT NULL,
                stage VARCHAR(10),
                cancel_requested BOOLEAN NOT NULL DEFAULT 0,
                container_id VARCHAR(64),
                PRIMARY KEY (id),
                CONSTRAINT ck_elab_status CHECK (%s),
                FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        """ % NEW_CHECK))
        conn.execute(sa.text("""
            INSERT INTO elab_runs_new
                (user_id, language, source_code, stdin, status, stdout, stderr,
                 exit_code, runtime_ms, started_at, completed_at, id, created_at,
                 updated_at, tenant_id, source_hash, stage, cancel_requested, container_id)
            SELECT user_id, language, source_code, stdin,
                 CASE status WHEN 'succeeded' THEN 'completed' ELSE status END,
                 stdout, stderr, exit_code, runtime_ms, started_at, completed_at,
                 id, created_at, updated_at, tenant_id, source_hash,
                 NULL, 0, NULL
            FROM elab_runs
        """))
        conn.execute(sa.text("DROP TABLE elab_runs"))
        conn.execute(sa.text("ALTER TABLE elab_runs_new RENAME TO elab_runs"))
        for name, col in (("ix_elab_runs_user_id", "user_id"),
                          ("ix_elab_runs_status", "status"),
                          ("ix_elab_runs_tenant_id", "tenant_id"),
                          ("ix_elab_runs_source_hash", "source_hash")):
            conn.execute(sa.text(f"CREATE INDEX {name} ON elab_runs ({col})"))
        conn.execute(sa.text("PRAGMA foreign_keys=ON"))
        return

    op.execute(sa.text("UPDATE elab_runs SET status='completed' WHERE status='succeeded'"))
    op.execute(sa.text("ALTER TABLE elab_runs DROP CONSTRAINT IF EXISTS ck_elab_status"))
    op.create_check_constraint("ck_elab_status", "elab_runs", sa.text(NEW_CHECK))
    op.add_column("elab_runs", sa.Column("stage", sa.String(10), nullable=True))
    op.add_column("elab_runs", sa.Column("cancel_requested", sa.Boolean(), nullable=False,
                                         server_default=sa.false()))
    op.add_column("elab_runs", sa.Column("container_id", sa.String(64), nullable=True))


def downgrade() -> None:
    if _is_sqlite():
        conn = op.get_bind()
        conn.execute(sa.text("PRAGMA foreign_keys=OFF"))
        conn.execute(sa.text("""
            CREATE TABLE elab_runs_new (
                user_id CHAR(32) NOT NULL,
                language VARCHAR(20) NOT NULL,
                source_code TEXT NOT NULL,
                stdin TEXT NOT NULL,
                status VARCHAR(20) NOT NULL,
                stdout TEXT NOT NULL,
                stderr TEXT NOT NULL,
                exit_code INTEGER,
                runtime_ms INTEGER,
                started_at DATETIME,
                completed_at DATETIME,
                id CHAR(32) NOT NULL,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                tenant_id CHAR(32) NOT NULL,
                source_hash VARCHAR(64) NOT NULL,
                PRIMARY KEY (id),
                CONSTRAINT ck_elab_status CHECK (%s),
                FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        """ % OLD_CHECK))
        conn.execute(sa.text("""
            INSERT INTO elab_runs_new
                (user_id, language, source_code, stdin, status, stdout, stderr,
                 exit_code, runtime_ms, started_at, completed_at, id, created_at,
                 updated_at, tenant_id, source_hash)
            SELECT user_id, language, source_code, stdin,
                 CASE status WHEN 'completed' THEN 'succeeded'
                             WHEN 'cancelled' THEN 'failed' ELSE status END,
                 stdout, stderr, exit_code, runtime_ms, started_at, completed_at,
                 id, created_at, updated_at, tenant_id, source_hash
            FROM elab_runs
        """))
        conn.execute(sa.text("DROP TABLE elab_runs"))
        conn.execute(sa.text("ALTER TABLE elab_runs_new RENAME TO elab_runs"))
        for name, col in (("ix_elab_runs_user_id", "user_id"),
                          ("ix_elab_runs_status", "status"),
                          ("ix_elab_runs_tenant_id", "tenant_id"),
                          ("ix_elab_runs_source_hash", "source_hash")):
            conn.execute(sa.text(f"CREATE INDEX {name} ON elab_runs ({col})"))
        conn.execute(sa.text("PRAGMA foreign_keys=ON"))
        return

    op.execute(sa.text(
        "UPDATE elab_runs SET status='succeeded' WHERE status='completed'"))
    op.execute(sa.text(
        "UPDATE elab_runs SET status='failed' WHERE status='cancelled'"))
    op.execute(sa.text("ALTER TABLE elab_runs DROP CONSTRAINT IF EXISTS ck_elab_status"))
    op.create_check_constraint("ck_elab_status", "elab_runs", sa.text(OLD_CHECK))
    op.drop_column("elab_runs", "container_id")
    op.drop_column("elab_runs", "cancel_requested")
    op.drop_column("elab_runs", "stage")
