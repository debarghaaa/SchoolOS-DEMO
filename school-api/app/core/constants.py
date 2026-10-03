from __future__ import annotations

"""Shared constants. Role values use the same hyphenated form as the web client."""


class Role:
    SUPER_ADMIN = "super-admin"
    SCHOOL_ADMIN = "school-admin"
    TEACHER = "teacher"
    STUDENT = "student"
    PARENT = "parent"

    ALL = (SUPER_ADMIN, SCHOOL_ADMIN, TEACHER, STUDENT, PARENT)


class UserStatus:
    ACTIVE = "active"
    DISABLED = "disabled"
    INVITED = "invited"


class TenantStatus:
    TRIAL = "trial"
    ACTIVE = "active"
    SUSPENDED = "suspended"


class TokenPurpose:
    RESET = "password_reset"
    VERIFY = "email_verify"
    INVITE = "invite"
    SELECT = "tenant_select"
