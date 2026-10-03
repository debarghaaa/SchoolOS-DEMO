"""PostgreSQL Row-Level Security as a second isolation layer.

Revision ID: c4d2e8a1f6b3
Revises: 007aced6439c
Create Date: 2026-09-24

The application always scopes queries by tenant_id itself; these policies are
the backstop. Session variables are set server-side per request
(see app/core/db.set_rls):

- app.tenant_id  — the authenticated tenant (UUID string)
- app.bypass_rls — 'true' only for privileged service flows (login, token
  verification, workers) and super-admin platform reads, which scope
  explicitly in application code.

Tables WITHOUT RLS by design: refresh_tokens and one_time_tokens are keyed
by unguessable hashes plus the user_id from a verified JWT, and are only
touched during auth flows that run before any tenant is known.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "c4d2e8a1f6b3"
down_revision: str | None = "007aced6439c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TENANT_TABLES = [
    "users", "students", "teachers", "parents", "parent_links", "classes",
    "subjects", "class_subjects", "teacher_assignments", "enrollments",
    "attendance_records", "assignments", "submissions", "grades",
    "timetable_slots", "notifications", "files", "elab_runs", "audit_logs",
]


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    for table in TENANT_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} FOR ALL "
            f"USING (tenant_id::text = current_setting('app.tenant_id', true) "
            f"OR current_setting('app.bypass_rls', true) = 'true')"
        )
    op.execute("ALTER TABLE tenants ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE tenants FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_self ON tenants FOR ALL "
        "USING (id::text = current_setting('app.tenant_id', true) "
        "OR current_setting('app.bypass_rls', true) = 'true')"
    )
    # Super-admin emails are globally unique (NULL tenant_id skips the composite unique).
    op.execute("CREATE UNIQUE INDEX uq_users_superadmin_email ON users (email) WHERE tenant_id IS NULL")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute("DROP INDEX IF EXISTS uq_users_superadmin_email")
    op.execute("DROP POLICY IF EXISTS tenant_self ON tenants")
    op.execute("ALTER TABLE tenants DISABLE ROW LEVEL SECURITY")
    for table in TENANT_TABLES:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
