from __future__ import annotations

import datetime as dt
import uuid

from pydantic import BaseModel, ConfigDict, Field


class AssignmentCreate(BaseModel):
    class_id: uuid.UUID
    subject_id: uuid.UUID
    teacher_id: uuid.UUID | None = Field(default=None, description="Required when a school-admin creates on a teacher's behalf; ignored for teachers (forced to self).")
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=10000)
    due_at: dt.datetime
    max_score: float = Field(default=100.0, gt=0)


class AssignmentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=10000)
    due_at: dt.datetime | None = None
    max_score: float | None = Field(default=None, gt=0)


class AssignmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    class_id: uuid.UUID
    subject_id: uuid.UUID
    teacher_id: uuid.UUID
    title: str
    description: str
    due_at: dt.datetime
    max_score: float
    status: str
    published_at: dt.datetime | None


class SubmissionCreate(BaseModel):
    content: str = Field(default="", max_length=50000)
    file_id: uuid.UUID | None = None


class SubmissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    assignment_id: uuid.UUID
    student_id: uuid.UUID
    content: str
    file_id: uuid.UUID | None
    submitted_at: dt.datetime
    is_late: bool
    status: str


class GradeCreate(BaseModel):
    score: float = Field(ge=0)
    feedback: str = Field(default="", max_length=5000)


class GradeUpdate(BaseModel):
    score: float | None = Field(default=None, ge=0)
    feedback: str | None = Field(default=None, max_length=5000)


class GradeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    submission_id: uuid.UUID
    student_id: uuid.UUID
    teacher_id: uuid.UUID | None
    score: float
    max_score: float
    feedback: str
    graded_at: dt.datetime
    published_at: dt.datetime | None
