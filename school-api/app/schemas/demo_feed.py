from __future__ import annotations

import uuid

from pydantic import BaseModel


class DemoDirectoryRow(BaseModel):
    id: uuid.UUID
    name: str
    initials: str = ""
    subject: str | None = None
    dept: str | None = None
    role: str | None = None
    staff_type: str | None = None
    grade: str | None = None
    section: str | None = None
    roll: str | None = None
    class_name: str | None = None


class DemoPresenceRow(BaseModel):
    person_id: uuid.UUID
    status: str
    punch_in: str | None = None
    punch_out: str | None = None


class DemoDaySnapshot(BaseModel):
    day: str
    directory: list[DemoDirectoryRow]
    presence: list[DemoPresenceRow]


class SchoolAttendanceCounts(BaseModel):
    """Whole-school student presence aggregate for the admin overview island."""
    day: str
    total: int
    present: int
    absent: int
