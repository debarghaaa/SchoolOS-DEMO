from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import func, or_, select

from app.core.constants import Role
from app.core.errors import Conflict, Duplicate, Forbidden, NotFound, ValidationFailed
from app.models.academic import (
    ClassSubject, Enrollment, Parent, ParentStudent, SchoolClass, Student, Subject, Teacher, ClassMember,
)
from app.models.base import utcnow
from app.models.user import Role as RoleRow, TenantMembership, User, UserRole
from app.repositories.scoped import get_scoped, list_scoped
from app.services.audit import Action, log_ctx

if TYPE_CHECKING:
    from app.api.deps import RequestContext


def _is_admin(ctx: RequestContext) -> bool:
    return Role.SCHOOL_ADMIN in ctx.roles


# ---------------- Profiles & object-level scope ----------------

def teacher_profile(ctx: RequestContext) -> Teacher:
    t = ctx.db.scalar(select(Teacher).where(Teacher.user_id == ctx.user.id, Teacher.tenant_id == ctx.tenant_id))
    if t is None:
        raise Forbidden("No teacher profile is linked to this account.")
    return t


def student_profile(ctx: RequestContext) -> Student:
    s = ctx.db.scalar(select(Student).where(Student.user_id == ctx.user.id, Student.tenant_id == ctx.tenant_id))
    if s is None:
        raise Forbidden("No student profile is linked to this account.")
    return s


def parent_profile(ctx: RequestContext) -> Parent:
    p = ctx.db.scalar(select(Parent).where(Parent.user_id == ctx.user.id, Parent.tenant_id == ctx.tenant_id))
    if p is None:
        raise Forbidden("No parent profile is linked to this account.")
    return p


def teacher_class_ids(ctx: RequestContext) -> set[uuid.UUID]:
    t = teacher_profile(ctx)
    assigned = ctx.db.scalars(select(ClassMember.class_id).where(ClassMember.teacher_id == t.id)).all()
    homeroom = ctx.db.scalars(select(SchoolClass.id).where(SchoolClass.class_teacher_id == t.id)).all()
    return set(assigned) | set(homeroom)


def require_teacher_class(ctx: RequestContext, class_id: uuid.UUID) -> SchoolClass:
    cls = get_scoped(ctx.db, SchoolClass, ctx.tenant_id, class_id, "class")
    if _is_admin(ctx):
        return cls
    if Role.TEACHER in ctx.roles and cls.id in teacher_class_ids(ctx):
        return cls
    raise Forbidden("You are not assigned to this class.")


def parent_student_ids(ctx: RequestContext) -> set[uuid.UUID]:
    p = parent_profile(ctx)
    return set(ctx.db.scalars(select(ParentStudent.student_id).where(ParentStudent.parent_id == p.id)).all())


def enrolled_class_ids(ctx: RequestContext, student_id: uuid.UUID) -> set[uuid.UUID]:
    return set(ctx.db.scalars(select(Enrollment.class_id).where(
        Enrollment.student_id == student_id, Enrollment.tenant_id == ctx.tenant_id,
        Enrollment.status == "active")).all())


def class_student_ids(ctx: RequestContext, class_id: uuid.UUID) -> set[uuid.UUID]:
    return set(ctx.db.scalars(select(Enrollment.student_id).where(
        Enrollment.class_id == class_id, Enrollment.tenant_id == ctx.tenant_id,
        Enrollment.status == "active")).all())


def student_scope_ids(ctx: RequestContext) -> set[uuid.UUID] | None:
    """Student ids the caller may see. None = every student in the tenant."""
    # Priority order: permissions union across grants, but object scope follows
    # the broadest applicable role.
    if _is_admin(ctx):
        return None
    if Role.TEACHER in ctx.roles:
        out: set[uuid.UUID] = set()
        for cid in teacher_class_ids(ctx):
            out |= class_student_ids(ctx, cid)
        return out
    if Role.STUDENT in ctx.roles:
        return {student_profile(ctx).id}
    if Role.PARENT in ctx.roles:
        return parent_student_ids(ctx)
    raise Forbidden("Not authorized.")


def require_student(ctx: RequestContext, student_id: uuid.UUID) -> Student:
    student = get_scoped(ctx.db, Student, ctx.tenant_id, student_id, "student")
    scope = student_scope_ids(ctx)
    if scope is not None and student.id not in scope:
        raise Forbidden("You are not authorized to view this student.")
    return student


def class_scope_ids(ctx: RequestContext) -> set[uuid.UUID] | None:
    if _is_admin(ctx):
        return None
    if Role.TEACHER in ctx.roles:
        return teacher_class_ids(ctx)
    if Role.STUDENT in ctx.roles:
        return enrolled_class_ids(ctx, student_profile(ctx).id)
    if Role.PARENT in ctx.roles:
        out: set[uuid.UUID] = set()
        for sid in parent_student_ids(ctx):
            out |= enrolled_class_ids(ctx, sid)
        return out
    raise Forbidden("Not authorized.")


def require_class_in_scope(ctx: RequestContext, class_id: uuid.UUID) -> SchoolClass:
    cls = get_scoped(ctx.db, SchoolClass, ctx.tenant_id, class_id, "class")
    scope = class_scope_ids(ctx)
    if scope is not None and cls.id not in scope:
        raise Forbidden("You are not authorized to view this class.")
    return cls


# ---------------- Students ----------------

def list_students(ctx, *, page, size, q, class_id):
    stmt = select(Student).where(Student.tenant_id == ctx.tenant_id)
    scope = student_scope_ids(ctx)
    if scope is not None:
        if not scope:
            return [], 0
        stmt = stmt.where(Student.id.in_(scope))
    if class_id is not None:
        require_class_in_scope(ctx, class_id)
        stmt = stmt.join(Enrollment, (Enrollment.student_id == Student.id)
                        & (Enrollment.class_id == class_id) & (Enrollment.status == "active"))
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(func.lower(Student.full_name).like(like), func.lower(Student.student_identifier).like(like)))
    total = ctx.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = list(ctx.db.scalars(stmt.order_by(Student.full_name).offset((page - 1) * size).limit(size)).all())
    return items, total


def get_student(ctx, student_id) -> Student:
    student = require_student(ctx, student_id)
    log_ctx(ctx, action=Action.PII_READ, resource_type="student", resource_id=student.id)
    return student


def _validate_profile_user(ctx, user_id: uuid.UUID | None, expected_role: str, model, field: str) -> None:
    if user_id is None:
        return
    user = ctx.db.get(User, user_id)
    if user is None:
        raise ValidationFailed("Linked user does not exist.")
    membership = ctx.db.scalar(select(TenantMembership).where(
        TenantMembership.user_id == user_id, TenantMembership.tenant_id == ctx.tenant_id))
    if membership is None:
        raise ValidationFailed("Linked user is not a member of this school.")
    granted = membership.role == expected_role or ctx.db.scalar(
        select(UserRole.id).join(RoleRow, RoleRow.id == UserRole.role_id).where(
            UserRole.user_id == user_id, UserRole.tenant_id == ctx.tenant_id,
            RoleRow.name == expected_role)) is not None
    if not granted:
        raise ValidationFailed(f"Linked user must have role '{expected_role}' in this school.")
    linked = ctx.db.scalar(select(model.id).where(
        getattr(model, field) == user_id, model.tenant_id == ctx.tenant_id))
    if linked is not None:
        raise Duplicate("This login is already linked to another profile.")


def create_student(ctx, data) -> Student:
    if ctx.db.scalar(select(Student.id).where(
            Student.tenant_id == ctx.tenant_id, Student.student_identifier == data.student_identifier)) is not None:
        raise Duplicate("Admission number already exists in this school.")
    _validate_profile_user(ctx, data.user_id, Role.STUDENT, Student, "user_id")
    student = Student(tenant_id=ctx.tenant_id, user_id=data.user_id, student_identifier=data.student_identifier,
                      full_name=data.full_name, date_of_birth=data.date_of_birth,
                      admission_date=data.admission_date, gender=data.gender)
    ctx.db.add(student)
    ctx.db.flush()
    log_ctx(ctx, action=Action.ACADEMIC_CHANGED, resource_type="student", resource_id=student.id, extra={"op": "create"})
    return student


def update_student(ctx, student_id, data) -> Student:
    student = get_scoped(ctx.db, Student, ctx.tenant_id, student_id, "student")
    payload = data.model_dump(exclude_unset=True)
    if "user_id" in payload:
        _validate_profile_user(ctx, payload["user_id"], Role.STUDENT, Student, "user_id")
    for key, value in payload.items():
        setattr(student, key, value)
    ctx.db.flush()
    log_ctx(ctx, action=Action.ACADEMIC_CHANGED, resource_type="student", resource_id=student.id, extra={"op": "update"})
    return student


# ---------------- Teachers ----------------

def list_teachers(ctx, *, page, size, q):
    stmt = select(Teacher).where(Teacher.tenant_id == ctx.tenant_id)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(func.lower(Teacher.full_name).like(like), func.lower(Teacher.employee_no).like(like)))
    total = ctx.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = list(ctx.db.scalars(stmt.order_by(Teacher.full_name).offset((page - 1) * size).limit(size)).all())
    return items, total


def get_teacher(ctx, teacher_id) -> Teacher:
    teacher = get_scoped(ctx.db, Teacher, ctx.tenant_id, teacher_id, "teacher")
    log_ctx(ctx, action=Action.PII_READ, resource_type="teacher", resource_id=teacher.id)
    return teacher


def create_teacher(ctx, data) -> Teacher:
    if ctx.db.scalar(select(Teacher.id).where(
            Teacher.tenant_id == ctx.tenant_id, Teacher.employee_no == data.employee_no)) is not None:
        raise Duplicate("Employee number already exists in this school.")
    _validate_profile_user(ctx, data.user_id, Role.TEACHER, Teacher, "user_id")
    teacher = Teacher(tenant_id=ctx.tenant_id, user_id=data.user_id, employee_no=data.employee_no,
                      full_name=data.full_name, qualification=data.qualification, phone=data.phone)
    ctx.db.add(teacher)
    ctx.db.flush()
    log_ctx(ctx, action=Action.ACADEMIC_CHANGED, resource_type="teacher", resource_id=teacher.id, extra={"op": "create"})
    return teacher


def update_teacher(ctx, teacher_id, data) -> Teacher:
    teacher = get_scoped(ctx.db, Teacher, ctx.tenant_id, teacher_id, "teacher")
    payload = data.model_dump(exclude_unset=True)
    if "user_id" in payload:
        _validate_profile_user(ctx, payload["user_id"], Role.TEACHER, Teacher, "user_id")
    for key, value in payload.items():
        setattr(teacher, key, value)
    ctx.db.flush()
    log_ctx(ctx, action=Action.ACADEMIC_CHANGED, resource_type="teacher", resource_id=teacher.id, extra={"op": "update"})
    return teacher


def assign_teacher(ctx, teacher_id, class_id, subject_id, member_type: str = "teacher") -> ClassMember:
    teacher = get_scoped(ctx.db, Teacher, ctx.tenant_id, teacher_id, "teacher")
    get_scoped(ctx.db, SchoolClass, ctx.tenant_id, class_id, "class")
    if subject_id is not None:
        get_scoped(ctx.db, Subject, ctx.tenant_id, subject_id, "subject")
    dup = ctx.db.scalar(select(ClassMember.id).where(
        ClassMember.teacher_id == teacher.id, ClassMember.class_id == class_id,
        ClassMember.subject_id == subject_id if subject_id else ClassMember.subject_id.is_(None)))
    if dup is not None:
        raise Duplicate("Teacher is already assigned to this class.")
    if member_type not in ("teacher", "assistant"):
        raise ValidationFailed("member_type must be 'teacher' or 'assistant'.")
    row = ClassMember(tenant_id=ctx.tenant_id, teacher_id=teacher.id, class_id=class_id,
                      subject_id=subject_id, member_type=member_type)
    ctx.db.add(row)
    ctx.db.flush()
    log_ctx(ctx, action=Action.LINK_CHANGED, resource_type="teacher_assignment", resource_id=row.id,
            extra={"teacher_id": str(teacher.id), "class_id": str(class_id), "member_type": member_type})
    return row


def unassign_teacher(ctx, assignment_id) -> None:
    row = get_scoped(ctx.db, ClassMember, ctx.tenant_id, assignment_id, "teacher_assignment")
    ctx.db.delete(row)
    ctx.db.flush()
    log_ctx(ctx, action=Action.LINK_CHANGED, resource_type="teacher_assignment", resource_id=assignment_id, extra={"op": "remove"})


def teacher_assignments(ctx, teacher_id):
    get_scoped(ctx.db, Teacher, ctx.tenant_id, teacher_id, "teacher")
    return list(ctx.db.scalars(select(ClassMember).where(
        ClassMember.teacher_id == teacher_id, ClassMember.tenant_id == ctx.tenant_id)).all())


# ---------------- Parents ----------------

def list_parents(ctx, *, page, size, q):
    stmt = select(Parent).where(Parent.tenant_id == ctx.tenant_id)
    if q:
        stmt = stmt.where(func.lower(Parent.full_name).like(f"%{q.lower()}%"))
    total = ctx.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = list(ctx.db.scalars(stmt.order_by(Parent.full_name).offset((page - 1) * size).limit(size)).all())
    return items, total


def get_parent(ctx, parent_id) -> Parent:
    if _is_admin(ctx):
        parent = get_scoped(ctx.db, Parent, ctx.tenant_id, parent_id, "parent")
    else:
        parent = parent_profile(ctx)
        if parent.id != parent_id:
            raise Forbidden("You are not authorized to view this profile.")
    log_ctx(ctx, action=Action.PII_READ, resource_type="parent", resource_id=parent.id)
    return parent


def create_parent(ctx, data) -> Parent:
    _validate_profile_user(ctx, data.user_id, Role.PARENT, Parent, "user_id")
    parent = Parent(tenant_id=ctx.tenant_id, user_id=data.user_id, full_name=data.full_name, phone=data.phone)
    ctx.db.add(parent)
    ctx.db.flush()
    log_ctx(ctx, action=Action.ACADEMIC_CHANGED, resource_type="parent", resource_id=parent.id, extra={"op": "create"})
    return parent


def update_parent(ctx, parent_id, data) -> Parent:
    parent = get_scoped(ctx.db, Parent, ctx.tenant_id, parent_id, "parent")
    payload = data.model_dump(exclude_unset=True)
    if "user_id" in payload:
        _validate_profile_user(ctx, payload["user_id"], Role.PARENT, Parent, "user_id")
    for key, value in payload.items():
        setattr(parent, key, value)
    ctx.db.flush()
    log_ctx(ctx, action=Action.ACADEMIC_CHANGED, resource_type="parent", resource_id=parent.id, extra={"op": "update"})
    return parent


def link_student(ctx, parent_id, student_id, relation) -> ParentStudent:
    parent = get_scoped(ctx.db, Parent, ctx.tenant_id, parent_id, "parent")
    get_scoped(ctx.db, Student, ctx.tenant_id, student_id, "student")
    if ctx.db.scalar(select(ParentStudent.id).where(
            ParentStudent.parent_id == parent.id, ParentStudent.student_id == student_id)) is not None:
        raise Duplicate("Student is already linked to this parent.")
    row = ParentStudent(tenant_id=ctx.tenant_id, parent_id=parent.id, student_id=student_id, relation=relation or "guardian")
    ctx.db.add(row)
    ctx.db.flush()
    log_ctx(ctx, action=Action.LINK_CHANGED, resource_type="parent_link", resource_id=row.id,
            extra={"parent_id": str(parent.id), "student_id": str(student_id)})
    return row


def unlink_student(ctx, parent_id, link_id) -> None:
    row = get_scoped(ctx.db, ParentStudent, ctx.tenant_id, link_id, "parent_link")
    if row.parent_id != parent_id:
        raise NotFound("Link not found.", resource="parent_link")
    ctx.db.delete(row)
    ctx.db.flush()
    log_ctx(ctx, action=Action.LINK_CHANGED, resource_type="parent_link", resource_id=link_id, extra={"op": "remove"})


def linked_children(ctx, parent_id):
    parent = get_parent(ctx, parent_id)
    ids = ctx.db.scalars(select(ParentStudent.student_id).where(ParentStudent.parent_id == parent.id)).all()
    if not ids:
        return []
    return list(ctx.db.scalars(select(Student).where(Student.id.in_(ids))).all())


# ---------------- Classes ----------------

def list_classes(ctx, *, page, size, academic_year, status):
    scope = class_scope_ids(ctx)
    filters = []
    if scope is not None:
        if not scope:
            return [], 0
        filters.append(SchoolClass.id.in_(scope))
    if academic_year:
        filters.append(SchoolClass.academic_year == academic_year)
    if status:
        filters.append(SchoolClass.status == status)
    return list_scoped(ctx.db, SchoolClass, ctx.tenant_id, page=page, size=size,
                       order_by=SchoolClass.name, filters=filters)


def get_class(ctx, class_id) -> SchoolClass:
    return require_class_in_scope(ctx, class_id)


def create_class(ctx, data) -> SchoolClass:
    if ctx.db.scalar(select(SchoolClass.id).where(
            SchoolClass.tenant_id == ctx.tenant_id, SchoolClass.name == data.name,
            SchoolClass.academic_year == data.academic_year)) is not None:
        raise Duplicate("A class with this name already exists for the academic year.")
    if data.class_teacher_id is not None:
        get_scoped(ctx.db, Teacher, ctx.tenant_id, data.class_teacher_id, "teacher")
    cls = SchoolClass(tenant_id=ctx.tenant_id, name=data.name, grade_level=data.grade_level,
                      section=data.section, academic_year=data.academic_year,
                      class_teacher_id=data.class_teacher_id)
    ctx.db.add(cls)
    ctx.db.flush()
    log_ctx(ctx, action=Action.CLASS_CHANGED, resource_type="class", resource_id=cls.id, extra={"op": "create"})
    return cls


def update_class(ctx, class_id, data) -> SchoolClass:
    cls = get_scoped(ctx.db, SchoolClass, ctx.tenant_id, class_id, "class")
    payload = data.model_dump(exclude_unset=True)
    if "class_teacher_id" in payload and payload["class_teacher_id"] is not None:
        get_scoped(ctx.db, Teacher, ctx.tenant_id, payload["class_teacher_id"], "teacher")
    if "status" in payload and payload["status"] not in ("active", "archived"):
        raise ValidationFailed("Status must be 'active' or 'archived'.")
    for key, value in payload.items():
        setattr(cls, key, value)
    ctx.db.flush()
    log_ctx(ctx, action=Action.CLASS_CHANGED, resource_type="class", resource_id=cls.id, extra={"op": "update"})
    return cls


def archive_class(ctx, class_id) -> SchoolClass:
    cls = get_scoped(ctx.db, SchoolClass, ctx.tenant_id, class_id, "class")
    cls.status = "archived"
    ctx.db.flush()
    log_ctx(ctx, action=Action.CLASS_CHANGED, resource_type="class", resource_id=cls.id, extra={"op": "archive"})
    return cls


def add_students(ctx, class_id, student_ids) -> dict:
    cls = get_scoped(ctx.db, SchoolClass, ctx.tenant_id, class_id, "class")
    enrolled, skipped = 0, 0
    for sid in set(student_ids):
        get_scoped(ctx.db, Student, ctx.tenant_id, sid, "student")
        exists = ctx.db.scalar(select(Enrollment.id).where(
            Enrollment.student_id == sid, Enrollment.class_id == cls.id,
            Enrollment.academic_year == cls.academic_year))
        if exists is not None:
            skipped += 1
            continue
        ctx.db.add(Enrollment(tenant_id=ctx.tenant_id, student_id=sid, class_id=cls.id,
                              academic_year=cls.academic_year, status="active"))
        enrolled += 1
    ctx.db.flush()
    log_ctx(ctx, action=Action.ENROLLMENT_CHANGED, resource_type="class", resource_id=cls.id,
            extra={"op": "bulk_enroll", "enrolled": enrolled, "skipped": skipped})
    return {"enrolled": enrolled, "skipped": skipped}


def assign_subjects(ctx, class_id, subject_ids) -> list[ClassSubject]:
    cls = get_scoped(ctx.db, SchoolClass, ctx.tenant_id, class_id, "class")
    rows = []
    for sub_id in set(subject_ids):
        get_scoped(ctx.db, Subject, ctx.tenant_id, sub_id, "subject")
        exists = ctx.db.scalar(select(ClassSubject).where(
            ClassSubject.class_id == cls.id, ClassSubject.subject_id == sub_id))
        if exists is not None:
            rows.append(exists)
            continue
        row = ClassSubject(tenant_id=ctx.tenant_id, class_id=cls.id, subject_id=sub_id)
        ctx.db.add(row)
        rows.append(row)
    ctx.db.flush()
    log_ctx(ctx, action=Action.CLASS_CHANGED, resource_type="class", resource_id=cls.id,
            extra={"op": "assign_subjects", "count": len(rows)})
    return rows


def remove_subject(ctx, class_id, subject_id) -> None:
    row = ctx.db.scalar(select(ClassSubject).where(
        ClassSubject.class_id == class_id, ClassSubject.subject_id == subject_id,
        ClassSubject.tenant_id == ctx.tenant_id))
    if row is None:
        raise NotFound("Subject is not assigned to this class.", resource="class_subject")
    ctx.db.delete(row)
    ctx.db.flush()
    log_ctx(ctx, action=Action.CLASS_CHANGED, resource_type="class", resource_id=class_id,
            extra={"op": "remove_subject", "subject_id": str(subject_id)})


def class_subjects(ctx, class_id):
    require_class_in_scope(ctx, class_id)
    return list(ctx.db.scalars(select(ClassSubject).where(
        ClassSubject.class_id == class_id, ClassSubject.tenant_id == ctx.tenant_id)).all())


# ---------------- Subjects ----------------

def list_subjects(ctx, *, page, size, q):
    filters = []
    if q:
        like = f"%{q.lower()}%"
        filters.append(or_(func.lower(Subject.name).like(like), func.lower(Subject.code).like(like)))
    return list_scoped(ctx.db, Subject, ctx.tenant_id, page=page, size=size, order_by=Subject.name, filters=filters)


def get_subject(ctx, subject_id) -> Subject:
    return get_scoped(ctx.db, Subject, ctx.tenant_id, subject_id, "subject")


def create_subject(ctx, data) -> Subject:
    if ctx.db.scalar(select(Subject.id).where(
            Subject.tenant_id == ctx.tenant_id, Subject.code == data.code)) is not None:
        raise Duplicate("Subject code already exists in this school.")
    subject = Subject(tenant_id=ctx.tenant_id, name=data.name, code=data.code, description=data.description)
    ctx.db.add(subject)
    ctx.db.flush()
    log_ctx(ctx, action=Action.ACADEMIC_CHANGED, resource_type="subject", resource_id=subject.id, extra={"op": "create"})
    return subject


def update_subject(ctx, subject_id, data) -> Subject:
    subject = get_scoped(ctx.db, Subject, ctx.tenant_id, subject_id, "subject")
    payload = data.model_dump(exclude_unset=True)
    for key, value in payload.items():
        setattr(subject, key, value)
    ctx.db.flush()
    log_ctx(ctx, action=Action.ACADEMIC_CHANGED, resource_type="subject", resource_id=subject.id, extra={"op": "update"})
    return subject


def delete_subject(ctx, subject_id) -> None:
    subject = get_scoped(ctx.db, Subject, ctx.tenant_id, subject_id, "subject")
    refs = (ctx.db.scalar(select(func.count()).select_from(ClassSubject).where(ClassSubject.subject_id == subject.id)) or 0)
    if refs:
        raise Conflict("Subject is assigned to classes. Remove those assignments first.", details={"references": refs})
    subject.deleted_at = utcnow()
    ctx.db.flush()
    log_ctx(ctx, action=Action.ACADEMIC_CHANGED, resource_type="subject", resource_id=subject_id, extra={"op": "soft_delete"})


# ---------------- Enrollments ----------------

def list_enrollments(ctx, *, page, size, class_id, student_id, status):
    stmt = select(Enrollment).where(Enrollment.tenant_id == ctx.tenant_id)
    if Role.TEACHER in ctx.roles:
        allowed = teacher_class_ids(ctx)
        if not allowed:
            return [], 0
        stmt = stmt.where(Enrollment.class_id.in_(allowed))
    elif Role.STUDENT in ctx.roles:
        stmt = stmt.where(Enrollment.student_id == student_profile(ctx).id)
    elif Role.PARENT in ctx.roles:
        linked = parent_student_ids(ctx)
        if not linked:
            return [], 0
        stmt = stmt.where(Enrollment.student_id.in_(linked))
    if class_id is not None:
        require_class_in_scope(ctx, class_id)
        stmt = stmt.where(Enrollment.class_id == class_id)
    if student_id is not None:
        require_student(ctx, student_id)
        stmt = stmt.where(Enrollment.student_id == student_id)
    if status:
        stmt = stmt.where(Enrollment.status == status)
    total = ctx.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = list(ctx.db.scalars(stmt.order_by(Enrollment.academic_year.desc()).offset((page - 1) * size).limit(size)).all())
    return items, total


def create_enrollment(ctx, data) -> Enrollment:
    student = get_scoped(ctx.db, Student, ctx.tenant_id, data.student_id, "student")
    cls = get_scoped(ctx.db, SchoolClass, ctx.tenant_id, data.class_id, "class")
    if ctx.db.scalar(select(Enrollment.id).where(
            Enrollment.student_id == student.id, Enrollment.class_id == cls.id,
            Enrollment.academic_year == data.academic_year)) is not None:
        raise Duplicate("Student is already enrolled in this class for the academic year.")
    row = Enrollment(tenant_id=ctx.tenant_id, student_id=student.id, class_id=cls.id,
                     academic_year=data.academic_year, status="active")
    ctx.db.add(row)
    ctx.db.flush()
    log_ctx(ctx, action=Action.ENROLLMENT_CHANGED, resource_type="enrollment", resource_id=row.id, extra={"op": "create"})
    return row


def update_enrollment(ctx, enrollment_id, data) -> Enrollment:
    row = get_scoped(ctx.db, Enrollment, ctx.tenant_id, enrollment_id, "enrollment")
    if data.status not in ("active", "withdrawn", "completed"):
        raise ValidationFailed("Status must be active, withdrawn or completed.")
    row.status = data.status
    ctx.db.flush()
    log_ctx(ctx, action=Action.ENROLLMENT_CHANGED, resource_type="enrollment", resource_id=row.id,
            extra={"op": "update", "status": data.status})
    return row


def delete_enrollment(ctx, enrollment_id) -> None:
    row = get_scoped(ctx.db, Enrollment, ctx.tenant_id, enrollment_id, "enrollment")
    ctx.db.delete(row)
    ctx.db.flush()
    log_ctx(ctx, action=Action.ENROLLMENT_CHANGED, resource_type="enrollment", resource_id=enrollment_id, extra={"op": "delete"})
