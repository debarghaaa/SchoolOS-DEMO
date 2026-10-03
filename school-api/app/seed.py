from __future__ import annotations

"""Prototype seed: platform super-admin + two fully populated schools.

Each school gets 1 admin, 3 teachers, 20 students, 5 parents, 3 classes and
5 subjects, plus enrollments, timetable, assignments with submissions and
grades, attendance history and notifications — enough to click through the
complete school-management workflow end to end.

Idempotent: every row is guarded by its natural key, so re-running the seed
only fills gaps. Deterministic: no randomness, fixed rotation patterns.

Usage:
    python -m app.seed
"""

import datetime as dt
import uuid

from sqlalchemy import select

from app.core.constants import Role, TenantStatus, UserStatus
from app.core.db import service_session, set_rls
from app.models.academic import (
    ClassMember, Enrollment, Parent, ParentStudent, SchoolClass, Student, Subject, Teacher,
    TeacherSubject,
)
from app.models.assignments import Assignment, Grade, Submission
from app.models.attendance import Attendance
from app.models.demo_feed import DemoFaculty, DemoPresence, DemoStaff, DemoStudent
from app.models.base import utcnow
from app.models.notification import Notification
from app.models.timetable import Timetable
from app.models.school import School
from app.models.subscription import FeatureFlag, Subscription
from app.models.tenant import Tenant
from app.models.user import Role as RoleRow, TenantMembership, User, UserRole
from app.security.password import hash_password

PASSWORD = "Password123"

SYSTEM_ROLES = (
    ("super-admin", "Platform operator. No tenant membership; access via platform grant."),
    ("school-admin", "Administers one school: people, classes, records."),
    ("teacher", "Teaches rostered classes; marks attendance; grades own work."),
    ("student", "Views own records; submits assignments."),
    ("parent", "Views linked children's records."),
)


def _role_id(name: str) -> uuid.UUID:
    return uuid.uuid5(uuid.NAMESPACE_DNS, f"schoolos.local/roles/{name}")


def _ensure_roles(db) -> None:
    for name, description in SYSTEM_ROLES:
        if db.scalar(select(RoleRow.id).where(RoleRow.name == name)) is None:
            db.add(RoleRow(id=_role_id(name), name=name, description=description, is_system=True))


def _user(db, *, email: str, first: str, last: str = "") -> User:
    email = email.lower()
    existing = db.scalar(select(User).where(User.email == email))
    if existing:
        return existing
    user = User(email=email, first_name=first, last_name=last,
                password_hash=hash_password(PASSWORD), status=UserStatus.ACTIVE,
                email_verified_at=utcnow())
    db.add(user)
    db.flush()
    return user


def _free_identifier(db, model, tenant_id: uuid.UUID, column: str, fmt: str, start: int) -> str:
    """First unused human identifier (robust against legacy seed data)."""
    n = start
    while db.scalar(select(model.id).where(
            model.tenant_id == tenant_id,
            getattr(model, column) == fmt.format(n))) is not None:
        n += 1
    return fmt.format(n)


def _membership(db, user: User, tenant_id: uuid.UUID, role: str) -> TenantMembership:
    existing = db.scalar(select(TenantMembership).where(
        TenantMembership.user_id == user.id, TenantMembership.tenant_id == tenant_id))
    if existing:
        return existing
    m = TenantMembership(tenant_id=tenant_id, user_id=user.id, role=role, status=UserStatus.ACTIVE)
    db.add(m)
    db.flush()
    return m


def _seed_demo_feed(db, tenant_id: uuid.UUID) -> None:
    """Example presence roster + today's punches for the temporary demo feed."""
    if db.scalar(select(DemoFaculty.id).where(DemoFaculty.tenant_id == tenant_id)) is not None:
        return
    today = dt.date.today()

    faculty = [
        ("Amit Verma", "AV", "Physics", "Sciences", "07:52", None),
        ("Priya Nair", "PN", "Mathematics", "Sciences", "07:48", "15:47"),
        ("Arjun Das", "RD", "English", "Humanities", "08:01", None),
        ("Kavita Rao", "KR", "Chemistry", "Sciences", "07:55", "15:52"),
        ("Vikram Iyer", "SI", "History", "Humanities", "08:05", None),
        ("Sunita Joshi", "LJ", "Biology", "Sciences", None, None),
    ]
    staff = [
        ("Ritu Malhotra", "RM", "Registrar", "Administration", "Administrative Staff", "07:41", None),
        ("Suresh Yadav", "SY", "Transport Manager", "Operations", "Transport", "07:35", "16:05"),
        ("Fatima Sheikh", "FS", "Librarian", "Library", "Library Staff", "07:58", None),
        ("Gopal Naskar", "GN", "Lab Technician", "Sciences", "Laboratory Staff", "07:50", "16:02"),
        ("Dipak Mondal", "DM", "IT Administrator", "Technology", "IT Support", "08:03", None),
        ("Karan Nair", "KN", "Security Officer", "Campus Safety", "Security", "07:30", None),
        ("Farhan Ali", "FA", "Maintenance Supervisor", "Facilities", "Maintenance", "07:44", "16:10"),
        ("Anjali Rao", "AR", "Counsellor", "Wellbeing", "Support Staff", None, None),
    ]
    students_10a = ["Aarav Sharma", "Rahul Verma", "Priya Sharma", "Arjun Chatterjee", "Neha Iyer", "Karan Joshi"]
    students_10b = ["Divya Nair", "Aditya Rao", "Sneha Kulkarni", "Vikram Reddy", "Pooja Menon", "Rahul Patel"]

    def punch(audience: str, person_id: uuid.UUID, pin: str | None, pout: str | None) -> None:
        db.add(DemoPresence(
            tenant_id=tenant_id, audience=audience, person_id=person_id, day=today,
            status="present" if pin else "absent",
            punch_in=dt.time.fromisoformat(pin) if pin else None,
            punch_out=dt.time.fromisoformat(pout) if pout else None))

    for name, initials, subject, dept, pin, pout in faculty:
        row = DemoFaculty(tenant_id=tenant_id, name=name, initials=initials,
                          subject=subject, dept=dept)
        db.add(row)
        db.flush()
        punch("faculty", row.id, pin, pout)
    for name, initials, role, dept, stype, pin, pout in staff:
        srow = DemoStaff(tenant_id=tenant_id, name=name, initials=initials,
                         role=role, dept=dept, staff_type=stype)
        db.add(srow)
        db.flush()
        punch("staff", srow.id, pin, pout)
    for class_name, grade, section, names in (
            ("Grade 10-A", "Grade 10", "A", students_10a),
            ("Grade 10-B", "Grade 10", "B", students_10b)):
        for i, name in enumerate(names, 1):
            strow = DemoStudent(tenant_id=tenant_id, name=name,
                                initials="".join(w[0] for w in name.split()),
                                grade=grade, section=section, roll=f"{i:02d}",
                                class_name=class_name)
            db.add(strow)
            db.flush()
            absent = (class_name, i) in (("Grade 10-A", 4), ("Grade 10-B", 6))
            punch("student", strow.id, None if absent else f"07:{44 + (i * 3) % 15:02d}", None)
    db.flush()


SCHOOLS = [
    {
        "name": "Northview High", "slug": "northview", "code": "NORTHVIEW",
        "domain": "northview.edu", "prefix": "NV", "tier": "pro",
        "admin": ("admin@northview.edu", "Ananya", "Rao"),
        "teachers": [
            ("rohan@northview.edu", "Rohan", "Sen"),
            ("meera.iyer@northview.edu", "Meera", "Iyer"),
            ("arjun.mehta@northview.edu", "Arjun", "Mehta"),
        ],
        "students": [
            ("ishita@northview.edu", "Ishita", "Dutta"),
            ("aarav.sharma@northview.edu", "Aarav", "Sharma"),
            ("diya.patel@northview.edu", "Diya", "Patel"),
            ("arjun.nair@northview.edu", "Arjun", "Nair"),
            ("myra.reddy@northview.edu", "Myra", "Reddy"),
            ("reyansh.iyer@northview.edu", "Reyansh", "Iyer"),
            ("sara.khan@northview.edu", "Sara", "Khan"),
            ("advait.menon@northview.edu", "Advait", "Menon"),
            ("ira.bose@northview.edu", "Ira", "Bose"),
            ("krishna.yadav@northview.edu", "Krishna", "Yadav"),
            ("tara.desai@northview.edu", "Tara", "Desai"),
            ("dev.malhotra@northview.edu", "Dev", "Malhotra"),
            ("anaya.joshi@northview.edu", "Anaya", "Joshi"),
            ("ishaan.rao@northview.edu", "Ishaan", "Rao"),
            ("pari.shah@northview.edu", "Pari", "Shah"),
            ("yash.thakur@northview.edu", "Yash", "Thakur"),
            ("navya.pillai@northview.edu", "Navya", "Pillai"),
            ("rudra.verma@northview.edu", "Rudra", "Verma"),
            ("kiara.bhatt@northview.edu", "Kiara", "Bhatt"),
            ("om.chavan@northview.edu", "Om", "Chavan"),
        ],
        "parents": [
            ("parent@example.com", "Guardian Dutta", "father", 0),
            ("lakshmi.sharma@example.com", "Lakshmi Sharma", "mother", 1),
            ("rajesh.patel@example.com", "Rajesh Patel", "father", 2),
            ("sunita.nair@example.com", "Sunita Nair", "mother", 3),
            ("vikram.reddy@example.com", "Vikram Reddy", "father", 4),
        ],
    },
    {
        "name": "Riverside Academy", "slug": "riverside", "code": "RIVERSIDE",
        "domain": "riverside.edu", "prefix": "RA", "tier": "trial",
        "admin": ("priya.nair@riverside.edu", "Priya", "Nair"),
        "teachers": [
            ("kabir.shah@riverside.edu", "Kabir", "Shah"),
            ("divya.nair@riverside.edu", "Divya", "Nair"),
            ("farhan.qureshi@riverside.edu", "Farhan", "Qureshi"),
        ],
        "students": [
            ("aisha.khan@riverside.edu", "Aisha", "Khan"),
            ("aditya.rao@riverside.edu", "Aditya", "Rao"),
            ("zoya.sheikh@riverside.edu", "Zoya", "Sheikh"),
            ("vivaan.malhotra@riverside.edu", "Vivaan", "Malhotra"),
            ("anvi.kulkarni@riverside.edu", "Anvi", "Kulkarni"),
            ("arnav.deshmukh@riverside.edu", "Arnav", "Deshmukh"),
            ("diya.bhatt@riverside.edu", "Diya", "Bhatt"),
            ("kabir.anand@riverside.edu", "Kabir", "Anand"),
            ("ira.sharma@riverside.edu", "Ira", "Sharma"),
            ("reyansh.gupta@riverside.edu", "Reyansh", "Gupta"),
            ("myra.iyer@riverside.edu", "Myra", "Iyer"),
            ("dev.patel@riverside.edu", "Dev", "Patel"),
            ("sara.nair@riverside.edu", "Sara", "Nair"),
            ("yash.reddy@riverside.edu", "Yash", "Reddy"),
            ("tara.singh@riverside.edu", "Tara", "Singh"),
            ("om.joshi@riverside.edu", "Om", "Joshi"),
            ("pari.verma@riverside.edu", "Pari", "Verma"),
            ("advait.shah@riverside.edu", "Advait", "Shah"),
            ("kiara.menon@riverside.edu", "Kiara", "Menon"),
            ("rudra.bose@riverside.edu", "Rudra", "Bose"),
        ],
        "parents": [
            ("farah.khan@example.com", "Farah Khan", "mother", 0),
            ("sanjay.rao@example.com", "Sanjay Rao", "father", 1),
            ("imran.sheikh@example.com", "Imran Sheikh", "father", 2),
            ("kavita.malhotra@example.com", "Kavita Malhotra", "mother", 3),
            ("ramesh.kulkarni@example.com", "Ramesh Kulkarni", "father", 4),
        ],
    },
]

CLASSES = [("Grade 10-A", "Grade 10", "A"), ("Grade 10-B", "Grade 10", "B"), ("Grade 11-A", "Grade 11", "A")]
SUBJECTS = [("Mathematics", "MAT"), ("Physics", "PHY"), ("Chemistry", "CHE"), ("English", "ENG"), ("History", "HIS")]
YEAR = "2026-27"
PERIODS = [(dt.time(8, 0), dt.time(8, 45)), (dt.time(9, 0), dt.time(9, 45)),
           (dt.time(10, 0), dt.time(10, 45)), (dt.time(11, 0), dt.time(11, 45))]


def _seed_school(db, cfg: dict) -> None:
    tenant = db.scalar(select(Tenant).where(Tenant.slug == cfg["slug"]))
    if tenant is None:
        tenant = Tenant(name=cfg["name"], slug=cfg["slug"], status=TenantStatus.ACTIVE)
        db.add(tenant)
        db.flush()
    tid = tenant.id
    if db.scalar(select(Subscription.id).where(Subscription.tenant_id == tid)) is None:
        db.add(Subscription(tenant_id=tid, tier=cfg["tier"], status="active", meta={}))
    if db.scalar(select(School.id).where(School.tenant_id == tid)) is None:
        db.add(School(tenant_id=tid, name=cfg["name"], code=cfg["code"], academic_year=YEAR))
    if db.scalar(select(FeatureFlag.id).where(
            FeatureFlag.tenant_id == tid, FeatureFlag.key == "elab")) is None:
        db.add(FeatureFlag(tenant_id=tid, key="elab", enabled=True, payload={}))
    db.flush()

    # --- People ---
    a_email, a_first, a_last = cfg["admin"]
    admin = _user(db, email=a_email, first=a_first, last=a_last)
    _membership(db, admin, tid, Role.SCHOOL_ADMIN)

    teachers = []
    for i, (email, first, last) in enumerate(cfg["teachers"]):
        user = _user(db, email=email, first=first, last=last)
        _membership(db, user, tid, Role.TEACHER)
        teacher = db.scalar(select(Teacher).where(Teacher.user_id == user.id))
        if teacher is None:
            teacher = Teacher(tenant_id=tid, user_id=user.id,
                              employee_no=_free_identifier(db, Teacher, tid, "employee_no", "T-{:03d}", i + 1),
                              full_name=f"{first} {last}")
            db.add(teacher)
            db.flush()
        teachers.append(teacher)

    students = []
    for i, (email, first, last) in enumerate(cfg["students"]):
        user = _user(db, email=email, first=first, last=last)
        _membership(db, user, tid, Role.STUDENT)
        student = db.scalar(select(Student).where(Student.user_id == user.id))
        if student is None:
            ident = _free_identifier(db, Student, tid, "student_identifier",
                                     f"{cfg['prefix']}-2024-{{:03d}}", i + 1)
            student = Student(tenant_id=tid, user_id=user.id,
                              student_identifier=ident, full_name=f"{first} {last}")
            db.add(student)
            db.flush()
        students.append(student)

    parents = []
    for email, full_name, relation, child_idx in cfg["parents"]:
        parts = full_name.split(" ", 1)
        user = _user(db, email=email, first=parts[0], last=parts[1] if len(parts) > 1 else "")
        _membership(db, user, tid, Role.PARENT)
        parent = db.scalar(select(Parent).where(Parent.user_id == user.id))
        if parent is None:
            parent = Parent(tenant_id=tid, user_id=user.id, full_name=full_name)
            db.add(parent)
            db.flush()
        child = students[child_idx]
        if db.scalar(select(ParentStudent.id).where(ParentStudent.parent_id == parent.id,
                                                   ParentStudent.student_id == child.id)) is None:
            db.add(ParentStudent(tenant_id=tid, parent_id=parent.id,
                                 student_id=child.id, relation=relation))
        parents.append(parent)
    db.flush()

    # --- Classes, subjects, enrollments, staffing ---
    classes = []
    for i, (name, grade, section) in enumerate(CLASSES):
        cls = db.scalar(select(SchoolClass).where(SchoolClass.tenant_id == tid,
                                                  SchoolClass.name == name))
        if cls is None:
            cls = SchoolClass(tenant_id=tid, name=name, grade_level=grade, section=section,
                              academic_year=YEAR, class_teacher_id=teachers[i % 3].id)
            db.add(cls)
            db.flush()
        classes.append(cls)

    subjects = []
    for name, code in SUBJECTS:
        subject = db.scalar(select(Subject).where(Subject.tenant_id == tid, Subject.code == code))
        if subject is None:
            subject = Subject(tenant_id=tid, name=name, code=code)
            db.add(subject)
            db.flush()
        subjects.append(subject)

    for i, student in enumerate(students):
        cls = classes[i % 3]
        has_any = db.scalar(select(Enrollment.id).where(
            Enrollment.student_id == student.id, Enrollment.academic_year == YEAR)) is not None
        if not has_any:
            db.add(Enrollment(tenant_id=tid, student_id=student.id, class_id=cls.id,
                              academic_year=YEAR, status="active"))
    db.flush()

    # Staffing: teacher t teaches subject s in class c unless (s+t+c) % 3 == 2.
    # Each class keeps 2 teachers per subject; the timetable draws from this map.
    roster: dict[tuple[int, int], list[int]] = {}
    for c in range(3):
        for s in range(5):
            roster[(c, s)] = [t for t in range(3) if (s + t + c) % 3 != 2]
            for t in roster[(c, s)]:
                if db.scalar(select(ClassMember.id).where(
                        ClassMember.teacher_id == teachers[t].id,
                        ClassMember.class_id == classes[c].id,
                        ClassMember.subject_id == subjects[s].id)) is None:
                    db.add(ClassMember(tenant_id=tid, teacher_id=teachers[t].id,
                                       class_id=classes[c].id, subject_id=subjects[s].id,
                                       member_type="teacher"))
    for t in range(3):
        for s in (t % 5, (t + 2) % 5):
            if db.scalar(select(TeacherSubject.id).where(
                    TeacherSubject.teacher_id == teachers[t].id,
                    TeacherSubject.subject_id == subjects[s].id)) is None:
                db.add(TeacherSubject(tenant_id=tid, teacher_id=teachers[t].id,
                                      subject_id=subjects[s].id))
    db.flush()

    # --- Timetable: Mon–Fri × 4 periods per class ---
    for c in range(3):
        for day in range(5):
            for p, (start, end) in enumerate(PERIODS):
                s = (day + p + c) % 5
                t = roster[(c, s)][(day + p) % len(roster[(c, s)])]
                if db.scalar(select(Timetable.id).where(
                        Timetable.class_id == classes[c].id, Timetable.day_of_week == day,
                        Timetable.start_time == start)) is None:
                    db.add(Timetable(tenant_id=tid, class_id=classes[c].id,
                                     subject_id=subjects[s].id, teacher_id=teachers[t].id,
                                     day_of_week=day, start_time=start, end_time=end,
                                     room=f"R-{c + 1}0{p + 1}"))
    db.flush()

    now = utcnow()
    today = now.date()

    # --- Assignments: one graded (past due) + one open (future due) per class ---
    for c in range(3):
        cls = classes[c]
        teacher = teachers[c % 3]
        enrolled = db.scalars(select(Enrollment.student_id).where(
            Enrollment.class_id == cls.id, Enrollment.academic_year == YEAR)).all()
        if not enrolled:
            continue
        subj = subjects[c % 5]
        past_due = now - dt.timedelta(days=3)
        open_due = now + dt.timedelta(days=6)

        past = db.scalar(select(Assignment).where(
            Assignment.class_id == cls.id, Assignment.title == f"{subj.name} Problem Set 1"))
        if past is None:
            past = Assignment(tenant_id=tid, class_id=cls.id, subject_id=subj.id,
                              teacher_id=teacher.id, title=f"{subj.name} Problem Set 1",
                              description="First graded problem set of the term.",
                              due_at=past_due, max_score=100.0, status="published",
                              published_at=past_due - dt.timedelta(days=7))
            db.add(past)
            db.flush()
        upcoming = db.scalar(select(Assignment).where(
            Assignment.class_id == cls.id, Assignment.title == f"{subj.name} Problem Set 2"))
        if upcoming is None:
            upcoming = Assignment(tenant_id=tid, class_id=cls.id, subject_id=subj.id,
                                  teacher_id=teacher.id, title=f"{subj.name} Problem Set 2",
                                  description="Second problem set — due next week.",
                                  due_at=open_due, max_score=100.0, status="published",
                                  published_at=now - dt.timedelta(days=1))
            db.add(upcoming)
            db.flush()

        for j, student_id in enumerate(enrolled):
            sub = db.scalar(select(Submission).where(
                Submission.assignment_id == past.id, Submission.student_id == student_id))
            if sub is None:
                sub = Submission(tenant_id=tid, assignment_id=past.id, student_id=student_id,
                                 content=f"Solutions by student {j + 1}.",
                                 submitted_at=past_due - dt.timedelta(days=1),
                                 is_late=(j % 7 == 6), status="graded")
                db.add(sub)
                db.flush()
            if db.scalar(select(Grade.id).where(Grade.submission_id == sub.id)) is None:
                score = 68.0 + ((j * 7) % 30)
                db.add(Grade(tenant_id=tid, submission_id=sub.id, student_id=student_id,
                             teacher_id=teacher.id, score=score, max_score=100.0,
                             feedback="Well done." if score >= 80 else "Revise chapters 2–3.",
                             graded_at=past_due + dt.timedelta(days=1),
                             published_at=past_due + dt.timedelta(days=2)))
            if j % 2 == 0 and db.scalar(select(Submission.id).where(
                    Submission.assignment_id == upcoming.id,
                    Submission.student_id == student_id)) is None:
                db.add(Submission(tenant_id=tid, assignment_id=upcoming.id, student_id=student_id,
                                  content="Draft solutions.", submitted_at=now - dt.timedelta(hours=5),
                                  is_late=False, status="submitted"))
    db.flush()

    # --- Attendance: past 5 weekdays, all students ---
    weekdays: list[dt.date] = []
    d = today - dt.timedelta(days=1)
    while len(weekdays) < 5:
        if d.weekday() < 5:
            weekdays.append(d)
        d -= dt.timedelta(days=1)
    enroll_map: dict = {}
    for student in students:
        cid = db.scalar(select(Enrollment.class_id).where(
            Enrollment.student_id == student.id, Enrollment.academic_year == YEAR))
        enroll_map[student.id] = cid or classes[0].id
    for i, student in enumerate(students):
        for k, att_day in enumerate(weekdays):
            if db.scalar(select(Attendance.id).where(
                    Attendance.tenant_id == tid, Attendance.student_id == student.id,
                    Attendance.date == att_day)) is None:
                status = "absent" if (i + k) % 11 == 0 else ("late" if (i + k) % 9 == 0 else "present")
                db.add(Attendance(tenant_id=tid, class_id=enroll_map[student.id],
                                  student_id=student.id, date=att_day, status=status))
    db.flush()

    # --- Notifications: grades, new work, attendance, announcement ---
    notes: list[tuple[uuid.UUID, str, str, str]] = []
    for c in range(3):
        cls = classes[c]
        student_users = db.scalars(select(Student.user_id).join(
            Enrollment, Enrollment.student_id == Student.id).where(
            Enrollment.class_id == cls.id, Enrollment.academic_year == YEAR,
            Student.user_id.is_not(None))).all()
        subj = subjects[c % 5].name
        for uid in student_users:
            notes.append((uid, "grade_published", f"Grade published: {subj} Problem Set 1",
                          "Your score is available in Grades."))
            notes.append((uid, "assignment_created", f"New assignment: {subj} Problem Set 2",
                          "Due in 6 days. See Assignments for details."))
    for parent, (_, _, _, child_idx) in zip(parents, cfg["parents"]):
        if parent.user_id is not None:
            child = students[child_idx]
            notes.append((parent.user_id, "attendance_update",
                          f"Attendance: {child.full_name.split()[0]} marked present",
                          f"{child.full_name} was marked present on {weekdays[0].isoformat()}."))
    notes.append((admin.id, "announcement", "Term 2 timetable published",
                  "The updated timetable is live for all classes."))
    for uid, ntype, title, body in notes:
        if db.scalar(select(Notification.id).where(
                Notification.tenant_id == tid, Notification.recipient_id == uid,
                Notification.type == ntype, Notification.title == title)) is None:
            db.add(Notification(tenant_id=tid, recipient_id=uid, type=ntype,
                                title=title, body=body, data={}))
    db.flush()


def main() -> None:
    with service_session() as db:
        set_rls(db, None, bypass=True)
        _ensure_roles(db)

        root = _user(db, email="root@schoolos.io", first="Platform", last="Root")
        if db.scalar(select(UserRole.id).where(
                UserRole.user_id == root.id, UserRole.tenant_id.is_(None))) is None:
            db.add(UserRole(user_id=root.id, role_id=_role_id(Role.SUPER_ADMIN), tenant_id=None))
            db.flush()

        for cfg in SCHOOLS:
            _seed_school(db, cfg)

        northview = db.scalar(select(Tenant).where(Tenant.slug == "northview"))
        if northview is not None:
            _seed_demo_feed(db, northview.id)

    print("Seed complete. Credentials (password for all):", PASSWORD)
    print("  super-admin : root@schoolos.io")
    print("  school-admin: admin@northview.edu / priya.nair@riverside.edu")
    print("  teacher     : rohan@northview.edu / kabir.shah@riverside.edu")
    print("  student     : ishita@northview.edu / aisha.khan@riverside.edu")
    print("  parent      : parent@example.com / farah.khan@example.com")


if __name__ == "__main__":
    main()
