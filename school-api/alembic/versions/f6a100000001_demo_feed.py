"""Demo presence feed tables (temporary, local demo only).

Revision ID: f6a100000001
Revises: e5f200000001
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "f6a100000001"
down_revision: str | None = "e5f200000001"
branch_labels = None
depends_on = None


def _demo_directory(table: str, *columns) -> None:
    op.create_table(
        table,
        sa.Column("id", sa.Uuid, primary_key=True),
        sa.Column("tenant_id", sa.Uuid, sa.ForeignKey("tenants.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        *columns,
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def upgrade() -> None:
    _demo_directory(
        "demo_faculty",
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("initials", sa.String(10), nullable=False, server_default=""),
        sa.Column("subject", sa.String(100), nullable=False, server_default=""),
        sa.Column("dept", sa.String(100), nullable=False, server_default=""),
    )
    _demo_directory(
        "demo_staff",
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("initials", sa.String(10), nullable=False, server_default=""),
        sa.Column("role", sa.String(100), nullable=False, server_default=""),
        sa.Column("dept", sa.String(100), nullable=False, server_default=""),
        sa.Column("staff_type", sa.String(40), nullable=False, server_default="Support Staff"),
    )
    _demo_directory(
        "demo_students",
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("initials", sa.String(10), nullable=False, server_default=""),
        sa.Column("grade", sa.String(40), nullable=False, server_default=""),
        sa.Column("section", sa.String(20), nullable=False, server_default=""),
        sa.Column("roll", sa.String(20), nullable=False, server_default=""),
        sa.Column("class_name", sa.String(80), nullable=False, server_default="", index=True),
    )
    op.create_index("ix_demo_students_tenant_class", "demo_students", ["tenant_id", "class_name"])
    op.create_table(
        "demo_presence",
        sa.Column("id", sa.Uuid, primary_key=True),
        sa.Column("tenant_id", sa.Uuid, sa.ForeignKey("tenants.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("audience", sa.String(20), nullable=False, index=True),
        sa.Column("person_id", sa.Uuid, nullable=False, index=True),
        sa.Column("day", sa.Date, nullable=False, index=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="absent"),
        sa.Column("punch_in", sa.Time, nullable=True),
        sa.Column("punch_out", sa.Time, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("tenant_id", "audience", "person_id", "day", name="uq_demo_presence_day"),
        sa.CheckConstraint("audience IN ('faculty','staff','student')", name="ck_demo_presence_audience"),
        sa.CheckConstraint("status IN ('present','absent')", name="ck_demo_presence_status"),
    )
    op.create_index("ix_demo_presence_today", "demo_presence", ["tenant_id", "day", "audience"])


def downgrade() -> None:
    op.drop_index("ix_demo_presence_today", table_name="demo_presence")
    op.drop_table("demo_presence")
    op.drop_index("ix_demo_students_tenant_class", table_name="demo_students")
    op.drop_table("demo_students")
    op.drop_table("demo_staff")
    op.drop_table("demo_faculty")
