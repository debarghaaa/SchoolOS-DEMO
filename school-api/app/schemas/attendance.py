from __future__ import annotations

import datetime as dt
import uuid

from pydantic import BaseModel, ConfigDict, Field


class AttendanceMark(BaseModel):
    class_id: uuid.UUID
    student_id: uuid.UUID
    date: dt.date
    status: str
    remarks: str = Field(default="", max_length=500)


class AttendanceBulkItem(BaseModel):
    student_id: uuid.UUID
    status: str
    remarks: str = Field(default="", max_length=500)


class AttendanceBulk(BaseModel):
    class_id: uuid.UUID
    date: dt.date
    records: list[AttendanceBulkItem] = Field(min_length=1, max_length=500)


class AttendanceUpdate(BaseModel):
    status: str
    remarks: str | None = Field(default=None, max_length=500)


class AttendanceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    class_id: uuid.UUID
    student_id: uuid.UUID
    date: dt.date
    status: str
    marked_by: uuid.UUID | None
    remarks: str


class AttendanceStats(BaseModel):
    total: int
    present: int
    absent: int
    late: int
    excused: int
    percentage: float
