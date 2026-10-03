from __future__ import annotations

import datetime as dt
import uuid

from pydantic import BaseModel, ConfigDict, Field

# ---------------- Students ----------------


class StudentCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    student_identifier: str = Field(min_length=1, max_length=40)
    user_id: uuid.UUID | None = None
    date_of_birth: dt.date | None = None
    admission_date: dt.date | None = None
    gender: str | None = None


class StudentUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    date_of_birth: dt.date | None = None
    admission_date: dt.date | None = None
    gender: str | None = None
    status: str | None = None
    user_id: uuid.UUID | None = None


class StudentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    user_id: uuid.UUID | None
    student_identifier: str
    full_name: str
    date_of_birth: dt.date | None
    admission_date: dt.date | None
    gender: str | None
    status: str


# ---------------- Teachers ----------------


class TeacherCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    employee_no: str = Field(min_length=1, max_length=40)
    user_id: uuid.UUID | None = None
    qualification: str | None = None
    phone: str | None = Field(default=None, max_length=30)


class TeacherUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    qualification: str | None = None
    phone: str | None = Field(default=None, max_length=30)
    user_id: uuid.UUID | None = None


class TeacherRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    user_id: uuid.UUID | None
    employee_no: str
    full_name: str
    qualification: str | None
    phone: str | None


class TeacherAssignRequest(BaseModel):
    class_id: uuid.UUID
    subject_id: uuid.UUID | None = None
    member_type: str = "teacher"


class ClassMemberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    teacher_id: uuid.UUID
    class_id: uuid.UUID
    subject_id: uuid.UUID | None
    member_type: str


# ---------------- Parents ----------------


class ParentCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    user_id: uuid.UUID | None = None
    phone: str | None = Field(default=None, max_length=30)


class ParentUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    phone: str | None = Field(default=None, max_length=30)
    user_id: uuid.UUID | None = None


class ParentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    user_id: uuid.UUID | None
    full_name: str
    phone: str | None


class ParentStudentRequest(BaseModel):
    student_id: uuid.UUID
    relation: str = "guardian"


class ParentStudentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    parent_id: uuid.UUID
    student_id: uuid.UUID
    relation: str


# ---------------- Classes ----------------


class ClassCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    grade_level: str = Field(default="", max_length=40)
    section: str = Field(default="", max_length=20)
    academic_year: str = Field(min_length=4, max_length=20)
    class_teacher_id: uuid.UUID | None = None


class ClassUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    grade_level: str | None = None
    section: str | None = None
    class_teacher_id: uuid.UUID | None = None
    status: str | None = None


class ClassRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    grade_level: str
    section: str
    academic_year: str
    class_teacher_id: uuid.UUID | None
    status: str


class ClassAddStudents(BaseModel):
    student_ids: list[uuid.UUID] = Field(min_length=1, max_length=500)


class ClassAssignSubjects(BaseModel):
    subject_ids: list[uuid.UUID] = Field(min_length=1, max_length=100)


class ClassSubjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    class_id: uuid.UUID
    subject_id: uuid.UUID
    teacher_id: uuid.UUID | None


# ---------------- Subjects ----------------


class SubjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    code: str = Field(min_length=1, max_length=40)
    description: str = Field(default="", max_length=500)


class SubjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None


class SubjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    code: str
    description: str


# ---------------- Enrollments ----------------


class EnrollmentCreate(BaseModel):
    student_id: uuid.UUID
    class_id: uuid.UUID
    academic_year: str = Field(min_length=4, max_length=20)


class EnrollmentUpdate(BaseModel):
    status: str


class EnrollmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    student_id: uuid.UUID
    class_id: uuid.UUID
    academic_year: str
    status: str
