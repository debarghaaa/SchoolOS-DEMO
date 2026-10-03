from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import (
    assignments, attendance, audit_logs, auth, classes, demo_feed, elab, enrollments, files,
    grades, notifications, parents, platform, schools, students, subjects, submissions, teachers,
    timetable, users,
)

api_router = APIRouter()
api_router.include_router(auth.router, tags=["Authentication"])
api_router.include_router(users.router, tags=["Users"])
api_router.include_router(students.router, tags=["Students"])
api_router.include_router(teachers.router, tags=["Teachers"])
api_router.include_router(parents.router, tags=["Parents"])
api_router.include_router(schools.router, tags=["Schools"])
api_router.include_router(platform.router, tags=["Platform"])
api_router.include_router(classes.router, tags=["Classes"])
api_router.include_router(subjects.router, tags=["Subjects"])
api_router.include_router(enrollments.router, tags=["Enrollments"])
api_router.include_router(attendance.router, tags=["Attendance"])
api_router.include_router(assignments.router, tags=["Assignments"])
api_router.include_router(submissions.router, tags=["Submissions"])
api_router.include_router(grades.router, tags=["Grades"])
api_router.include_router(timetable.router, tags=["Timetable"])
api_router.include_router(notifications.router, tags=["Notifications"])
api_router.include_router(files.router, tags=["Files"])
api_router.include_router(elab.router, tags=["E-Lab"])
api_router.include_router(audit_logs.router, tags=["Audit Logs"])
api_router.include_router(demo_feed.router)
