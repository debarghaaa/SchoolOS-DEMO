from __future__ import annotations

from app.core.constants import Role

# Permission matrix. Route handlers require a permission; services then apply
# object-level scope (assigned classes, linked children, own records).
PERMISSIONS: dict[str, set[str]] = {
    Role.SUPER_ADMIN: {
        "tenants.manage",
        "subscriptions.manage",
        "platform.manage",
        "audit.read_all",
    },
    Role.SCHOOL_ADMIN: {
        "schools.read_own",
        "users.manage",
        "students.manage",
        "teachers.manage",
        "parents.manage",
        "classes.manage",
        "subjects.manage",
        "enrollments.manage",
        "attendance.manage",
        "assignments.manage",
        "submissions.manage",
        "grades.manage",
        "timetable.manage",
        "files.manage",
        "files.upload",
        "notifications.send",
        "notifications.read",
        "elab.use",
        "elab.read_all",
        "audit.read",
    },
    Role.TEACHER: {
        "classes.read_assigned",
        "students.read_assigned",
        "attendance.mark",
        "attendance.read_assigned",
        "assignments.manage_assigned",
        "submissions.read_assigned",
        "submissions.grade",
        "grades.manage_assigned",
        "timetable.read_own",
        "files.upload",
        "files.read_submissions",
        "notifications.read",
        "elab.use",
    },
    Role.STUDENT: {
        "academic.read_own",
        "attendance.read_own",
        "assignments.read_own",
        "submissions.create_own",
        "grades.read_own",
        "timetable.read_own",
        "files.upload",
        "notifications.read",
        "elab.use",
    },
    Role.PARENT: {
        "children.read_linked",
        "attendance.read_linked",
        "assignments.read_linked",
        "grades.read_linked",
        "timetable.read_linked",
        "notifications.read",
    },
}


def has_permission(role: str, permission: str) -> bool:
    return permission in PERMISSIONS.get(role, set())
