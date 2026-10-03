from __future__ import annotations

import datetime as dt
import uuid

from app.core.db import SessionLocal
from app.models import DemoFaculty, DemoPresence, DemoStudent
from tests.helpers import data, error


def _seed_demo(tenant_id: str, day: dt.date) -> None:
    tid = uuid.UUID(tenant_id)
    with SessionLocal() as db:
        f = DemoFaculty(tenant_id=tid, name="Demo Teacher", initials="DT",
                        subject="Physics", dept="Science")
        db.add(f)
        db.flush()
        db.add(DemoPresence(tenant_id=tid, audience="faculty", person_id=f.id,
                            day=day, status="present",
                            punch_in=dt.time(7, 52), punch_out=None))
        for i, cls in (("01", "Grade 10-A"), ("02", "Grade 10-B")):
            s = DemoStudent(tenant_id=tid, name=f"Demo {cls}", initials="D",
                            grade="Grade 10", section=cls.rsplit("-", 1)[1],
                            roll=i, class_name=cls)
            db.add(s)
            db.flush()
            db.add(DemoPresence(tenant_id=tid, audience="student", person_id=s.id,
                                day=day, status="present", punch_in=dt.time(7, 50)))
        db.commit()


def test_admin_reads_staff_feeds_not_students(client, school):
    _seed_demo(school["tenant_id"], dt.date.today())
    fac = data(client.get("/api/v1/demo-feed/faculty", headers=school["admin"]))
    assert len(fac["directory"]) == 1
    assert fac["presence"][0]["status"] == "present"
    assert fac["presence"][0]["punch_in"] == "07:52:00"
    assert fac["day"] == dt.date.today().isoformat()
    assert error(client.get("/api/v1/demo-feed/students", headers=school["admin"])) == (403, "forbidden")


def test_teacher_scoped_to_assigned_demo_class(client, school):
    # The fixture assigns its teacher to Grade 10-B only.
    _seed_demo(school["tenant_id"], dt.date.today())
    assert error(client.get("/api/v1/demo-feed/faculty", headers=school["teacher"])) == (403, "forbidden")
    assert error(client.get("/api/v1/demo-feed/staff", headers=school["teacher"])) == (403, "forbidden")
    stu = data(client.get("/api/v1/demo-feed/students", headers=school["teacher"]))
    assert [r["class_name"] for r in stu["directory"]] == ["Grade 10-B"]
    assert len(stu["presence"]) == 1


def test_platform_denied_student_allowed(client, school):
    _seed_demo(school["tenant_id"], dt.date.today())
    assert error(client.get("/api/v1/demo-feed/faculty", headers=school["root"])) == (403, "forbidden")
    assert error(client.get("/api/v1/demo-feed/students", headers=school["root"])) == (403, "forbidden")
    own = data(client.get("/api/v1/demo-feed/students", headers=school["student"]))
    assert len(own["directory"]) == 1


def test_new_day_clones_latest_demo_punches(client, school):
    _seed_demo(school["tenant_id"], dt.date.today() - dt.timedelta(days=2))
    fac = data(client.get("/api/v1/demo-feed/faculty", headers=school["admin"]))
    assert fac["day"] == dt.date.today().isoformat()
    assert fac["presence"][0]["status"] == "present"
    assert fac["presence"][0]["punch_in"] == "07:52:00"


def test_school_attendance_counts_for_admin_only(client, school):
    _seed_demo(school["tenant_id"], dt.date.today())
    counts = data(client.get("/api/v1/demo-feed/school-attendance", headers=school["admin"]))
    assert counts["day"] == dt.date.today().isoformat()
    assert counts["total"] == 2
    assert counts["present"] == 2
    assert counts["absent"] == 0
    assert error(client.get("/api/v1/demo-feed/school-attendance",
                            headers=school["teacher"])) == (403, "forbidden")
    assert error(client.get("/api/v1/demo-feed/school-attendance",
                            headers=school["student"])) == (403, "forbidden")
    assert error(client.get("/api/v1/demo-feed/school-attendance",
                            headers=school["root"])) == (403, "forbidden")


def test_school_attendance_clones_forward_and_derives_absent(client, school):
    # Two days ago only one student punched; the clone-forward carries it to
    # today and absent is derived as total - present.
    _seed_demo(school["tenant_id"], dt.date.today() - dt.timedelta(days=2))
    counts = data(client.get("/api/v1/demo-feed/school-attendance", headers=school["admin"]))
    assert counts["day"] == dt.date.today().isoformat()
    assert counts["total"] == 2
    assert counts["present"] + counts["absent"] == counts["total"]


def test_student_reads_own_demo_row_only(client, school):
    _seed_demo(school["tenant_id"], dt.date.today())
    snap = data(client.get("/api/v1/demo-feed/students", headers=school["student"]))
    assert len(snap["directory"]) == 1
    assert snap["directory"][0]["name"] == "Demo Grade 10-A"
    assert snap["presence"][0]["person_id"] == snap["directory"][0]["id"]
    assert error(client.get("/api/v1/demo-feed/faculty", headers=school["student"])) == (403, "forbidden")


def test_parent_reads_linked_child_row_only(client, school):
    _seed_demo(school["tenant_id"], dt.date.today())
    snap = data(client.get("/api/v1/demo-feed/students", headers=school["parent"]))
    assert len(snap["directory"]) == 1
    assert snap["directory"][0]["name"] == "Demo Grade 10-A"
    assert error(client.get("/api/v1/demo-feed/school-attendance",
                            headers=school["parent"])) == (403, "forbidden")
