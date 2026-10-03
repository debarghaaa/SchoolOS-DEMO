from __future__ import annotations

import datetime as dt

from pydantic import BaseModel


class PlatformAnalytics(BaseModel):
    tenants_total: int
    tenants_by_status: dict[str, int]
    users_total: int
    memberships_by_role: dict[str, int]
    platform_admins: int
    students_total: int
    teachers_total: int
    classes_total: int
    elab_runs_24h: dict[str, int]
    generated_at: dt.datetime
