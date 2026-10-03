-- SchoolOS PostgreSQL schema (v2, 30 tables).
-- Generated from app.models metadata; RLS policies mirror migrations
-- 002 (c4d2e8a1f6b3) + 003 (e5f200000001). Deploys run Alembic, not this file.
-- ids are app-assigned UUIDs (no server default); CHECKs/RLS enforced by PG.


CREATE TABLE roles (
	name VARCHAR(40) NOT NULL, 
	description VARCHAR(300) NOT NULL, 
	is_system BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	id UUID NOT NULL, 
	PRIMARY KEY (id)
)

;


CREATE TABLE tenants (
	name VARCHAR(200) NOT NULL, 
	slug VARCHAR(100) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_tenants_status CHECK (status IN ('trial','active','suspended'))
)

;


CREATE TABLE users (
	email VARCHAR(255) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	first_name VARCHAR(100) NOT NULL, 
	last_name VARCHAR(100) NOT NULL, 
	phone VARCHAR(30), 
	status VARCHAR(20) NOT NULL, 
	email_verified_at TIMESTAMP WITH TIME ZONE, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_users_status CHECK (status IN ('active','disabled'))
)

;


CREATE TABLE audit_logs (
	tenant_id UUID, 
	actor_id UUID, 
	actor_role VARCHAR(20), 
	action VARCHAR(60) NOT NULL, 
	resource_type VARCHAR(60) NOT NULL, 
	resource_id VARCHAR(64), 
	ip VARCHAR(64), 
	user_agent VARCHAR(255), 
	metadata JSON NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	id UUID NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE, 
	FOREIGN KEY(actor_id) REFERENCES users (id) ON DELETE SET NULL
)

;


CREATE TABLE elab_runs (
	user_id UUID NOT NULL, 
	language VARCHAR(20) NOT NULL, 
	source_code TEXT NOT NULL, 
	source_hash VARCHAR(64) NOT NULL, 
	stdin TEXT NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	stdout TEXT NOT NULL, 
	stderr TEXT NOT NULL, 
	exit_code INTEGER, 
	runtime_ms INTEGER, 
	started_at TIMESTAMP WITH TIME ZONE, 
	completed_at TIMESTAMP WITH TIME ZONE, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	tenant_id UUID NOT NULL, 
	stage VARCHAR(10), 
	cancel_requested BOOLEAN NOT NULL DEFAULT false, 
	container_id VARCHAR(64), 
	PRIMARY KEY (id), 
	CONSTRAINT ck_elab_status CHECK (status IN ('queued','running','completed','failed','timeout','cancelled')), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
)

;


CREATE TABLE feature_flags (
	tenant_id UUID NOT NULL, 
	key VARCHAR(80) NOT NULL, 
	enabled BOOLEAN NOT NULL, 
	payload JSON NOT NULL, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_feature_flags_tenant_key UNIQUE (tenant_id, key), 
	FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
)

;


CREATE TABLE files (
	owner_id UUID, 
	object_key VARCHAR(500) NOT NULL, 
	filename VARCHAR(255) NOT NULL, 
	mime_type VARCHAR(128) NOT NULL, 
	size BIGINT NOT NULL, 
	purpose VARCHAR(40) NOT NULL, 
	uploaded BOOLEAN NOT NULL, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	tenant_id UUID NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(owner_id) REFERENCES users (id) ON DELETE SET NULL, 
	FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
)

;


CREATE TABLE notifications (
	recipient_id UUID NOT NULL, 
	type VARCHAR(40) NOT NULL, 
	title VARCHAR(200) NOT NULL, 
	body TEXT NOT NULL, 
	data JSON NOT NULL, 
	read_at TIMESTAMP WITH TIME ZONE, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	tenant_id UUID NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(recipient_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
)

;


CREATE TABLE one_time_tokens (
	user_id UUID NOT NULL, 
	purpose VARCHAR(30) NOT NULL, 
	token_hash VARCHAR(64) NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	used_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	id UUID NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
)

;


CREATE TABLE parents (
	user_id UUID, 
	full_name VARCHAR(200) NOT NULL, 
	phone VARCHAR(30), 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	tenant_id UUID NOT NULL, 
	deleted_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	UNIQUE (user_id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE SET NULL, 
	FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
)

;


CREATE TABLE refresh_tokens (
	user_id UUID NOT NULL, 
	jti VARCHAR(64) NOT NULL, 
	token_hash VARCHAR(64) NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	revoked_at TIMESTAMP WITH TIME ZONE, 
	ip VARCHAR(64), 
	user_agent VARCHAR(255), 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	id UUID NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
)

;


CREATE TABLE schools (
	name VARCHAR(200) NOT NULL, 
	code VARCHAR(40) NOT NULL, 
	address VARCHAR(500), 
	phone VARCHAR(30), 
	email VARCHAR(255), 
	academic_year VARCHAR(20) NOT NULL, 
	timezone VARCHAR(60) NOT NULL, 
	settings JSON NOT NULL, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	tenant_id UUID NOT NULL, 
	deleted_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_schools_tenant_code UNIQUE (tenant_id, code), 
	FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
)

;


CREATE TABLE students (
	user_id UUID, 
	student_identifier VARCHAR(40) NOT NULL, 
	full_name VARCHAR(200) NOT NULL, 
	date_of_birth DATE, 
	admission_date DATE, 
	gender VARCHAR(10), 
	status VARCHAR(20) NOT NULL, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	tenant_id UUID NOT NULL, 
	deleted_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_students_tenant_identifier UNIQUE (tenant_id, student_identifier), 
	CONSTRAINT ck_students_status CHECK (status IN ('active','graduated','withdrawn')), 
	UNIQUE (user_id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE SET NULL, 
	FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
)

;


CREATE TABLE subjects (
	name VARCHAR(120) NOT NULL, 
	code VARCHAR(40) NOT NULL, 
	description VARCHAR(500) NOT NULL, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	tenant_id UUID NOT NULL, 
	deleted_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_subjects_tenant_code UNIQUE (tenant_id, code), 
	FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
)

;


CREATE TABLE subscriptions (
	tenant_id UUID NOT NULL, 
	tier VARCHAR(40) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	trial_ends_at TIMESTAMP WITH TIME ZONE, 
	current_period_start TIMESTAMP WITH TIME ZONE, 
	current_period_end TIMESTAMP WITH TIME ZONE, 
	seats INTEGER NOT NULL, 
	meta JSON NOT NULL, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_subscriptions_status CHECK (status IN ('trialing','active','past_due','canceled')), 
	FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
)

;


CREATE TABLE teachers (
	user_id UUID, 
	employee_no VARCHAR(40) NOT NULL, 
	full_name VARCHAR(200) NOT NULL, 
	qualification VARCHAR(200), 
	phone VARCHAR(30), 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	tenant_id UUID NOT NULL, 
	deleted_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_teachers_tenant_employee UNIQUE (tenant_id, employee_no), 
	UNIQUE (user_id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE SET NULL, 
	FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
)

;


CREATE TABLE tenant_membership (
	tenant_id UUID NOT NULL, 
	user_id UUID NOT NULL, 
	role VARCHAR(20) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	id UUID NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_tenant_membership UNIQUE (tenant_id, user_id), 
	CONSTRAINT ck_membership_role CHECK (role IN ('super-admin','school-admin','teacher','student','parent')), 
	CONSTRAINT ck_membership_status CHECK (status IN ('active','disabled','invited')), 
	FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
)

;


CREATE TABLE user_roles (
	user_id UUID NOT NULL, 
	role_id UUID NOT NULL, 
	tenant_id UUID, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	id UUID NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(role_id) REFERENCES roles (id) ON DELETE CASCADE, 
	FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
)

;


CREATE TABLE classes (
	name VARCHAR(80) NOT NULL, 
	grade_level VARCHAR(40) NOT NULL, 
	section VARCHAR(20) NOT NULL, 
	academic_year VARCHAR(20) NOT NULL, 
	class_teacher_id UUID, 
	status VARCHAR(20) NOT NULL, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	tenant_id UUID NOT NULL, 
	deleted_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_classes_tenant_name_year UNIQUE (tenant_id, name, academic_year), 
	CONSTRAINT ck_classes_status CHECK (status IN ('active','archived')), 
	FOREIGN KEY(class_teacher_id) REFERENCES teachers (id) ON DELETE SET NULL, 
	FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
)

;


CREATE TABLE parent_student (
	parent_id UUID NOT NULL, 
	student_id UUID NOT NULL, 
	relation VARCHAR(40) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	id UUID NOT NULL, 
	tenant_id UUID NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_parent_student UNIQUE (parent_id, student_id), 
	FOREIGN KEY(parent_id) REFERENCES parents (id) ON DELETE CASCADE, 
	FOREIGN KEY(student_id) REFERENCES students (id) ON DELETE CASCADE, 
	FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
)

;


CREATE TABLE teacher_subjects (
	teacher_id UUID NOT NULL, 
	subject_id UUID NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	id UUID NOT NULL, 
	tenant_id UUID NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_teacher_subjects UNIQUE (teacher_id, subject_id), 
	FOREIGN KEY(teacher_id) REFERENCES teachers (id) ON DELETE CASCADE, 
	FOREIGN KEY(subject_id) REFERENCES subjects (id) ON DELETE CASCADE, 
	FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
)

;


CREATE TABLE assignments (
	class_id UUID NOT NULL, 
	subject_id UUID NOT NULL, 
	teacher_id UUID NOT NULL, 
	title VARCHAR(200) NOT NULL, 
	description TEXT NOT NULL, 
	due_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	max_score FLOAT NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	published_at TIMESTAMP WITH TIME ZONE, 
	reminder_sent_at TIMESTAMP WITH TIME ZONE, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	tenant_id UUID NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_assignments_status CHECK (status IN ('draft','published','archived')), 
	FOREIGN KEY(class_id) REFERENCES classes (id) ON DELETE CASCADE, 
	FOREIGN KEY(subject_id) REFERENCES subjects (id) ON DELETE CASCADE, 
	FOREIGN KEY(teacher_id) REFERENCES teachers (id) ON DELETE CASCADE, 
	FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
)

;


CREATE TABLE attendance (
	class_id UUID NOT NULL, 
	student_id UUID NOT NULL, 
	date DATE NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	marked_by UUID, 
	remarks VARCHAR(500) NOT NULL, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	tenant_id UUID NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_attendance_tenant_student_date UNIQUE (tenant_id, student_id, date), 
	CONSTRAINT ck_attendance_status CHECK (status IN ('present','absent','late','excused')), 
	FOREIGN KEY(class_id) REFERENCES classes (id) ON DELETE CASCADE, 
	FOREIGN KEY(student_id) REFERENCES students (id) ON DELETE CASCADE, 
	FOREIGN KEY(marked_by) REFERENCES users (id) ON DELETE SET NULL, 
	FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
)

;


CREATE TABLE class_members (
	class_id UUID NOT NULL, 
	member_type VARCHAR(20) NOT NULL, 
	teacher_id UUID NOT NULL, 
	subject_id UUID, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	id UUID NOT NULL, 
	tenant_id UUID NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_class_members UNIQUE (teacher_id, class_id, subject_id), 
	CONSTRAINT ck_class_members_type CHECK (member_type IN ('teacher','assistant')), 
	FOREIGN KEY(class_id) REFERENCES classes (id) ON DELETE CASCADE, 
	FOREIGN KEY(teacher_id) REFERENCES teachers (id) ON DELETE CASCADE, 
	FOREIGN KEY(subject_id) REFERENCES subjects (id) ON DELETE CASCADE, 
	FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
)

;


CREATE TABLE class_subjects (
	class_id UUID NOT NULL, 
	subject_id UUID NOT NULL, 
	teacher_id UUID, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	id UUID NOT NULL, 
	tenant_id UUID NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_class_subjects UNIQUE (class_id, subject_id), 
	FOREIGN KEY(class_id) REFERENCES classes (id) ON DELETE CASCADE, 
	FOREIGN KEY(subject_id) REFERENCES subjects (id) ON DELETE CASCADE, 
	FOREIGN KEY(teacher_id) REFERENCES teachers (id) ON DELETE SET NULL, 
	FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
)

;


CREATE TABLE enrollments (
	student_id UUID NOT NULL, 
	class_id UUID NOT NULL, 
	academic_year VARCHAR(20) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	tenant_id UUID NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_enrollments UNIQUE (student_id, class_id, academic_year), 
	CONSTRAINT ck_enrollments_status CHECK (status IN ('active','withdrawn','completed')), 
	FOREIGN KEY(student_id) REFERENCES students (id) ON DELETE CASCADE, 
	FOREIGN KEY(class_id) REFERENCES classes (id) ON DELETE CASCADE, 
	FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
)

;


CREATE TABLE timetable (
	class_id UUID NOT NULL, 
	subject_id UUID NOT NULL, 
	teacher_id UUID NOT NULL, 
	day_of_week INTEGER NOT NULL, 
	start_time TIME WITHOUT TIME ZONE NOT NULL, 
	end_time TIME WITHOUT TIME ZONE NOT NULL, 
	room VARCHAR(50), 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	tenant_id UUID NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_timetable_day CHECK (day_of_week BETWEEN 0 AND 6), 
	CONSTRAINT ck_timetable_times CHECK (end_time > start_time), 
	FOREIGN KEY(class_id) REFERENCES classes (id) ON DELETE CASCADE, 
	FOREIGN KEY(subject_id) REFERENCES subjects (id) ON DELETE CASCADE, 
	FOREIGN KEY(teacher_id) REFERENCES teachers (id) ON DELETE CASCADE, 
	FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
)

;


CREATE TABLE assignment_files (
	assignment_id UUID NOT NULL, 
	file_id UUID NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	id UUID NOT NULL, 
	tenant_id UUID NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_assignment_files UNIQUE (assignment_id, file_id), 
	FOREIGN KEY(assignment_id) REFERENCES assignments (id) ON DELETE CASCADE, 
	FOREIGN KEY(file_id) REFERENCES files (id) ON DELETE CASCADE, 
	FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
)

;


CREATE TABLE submissions (
	assignment_id UUID NOT NULL, 
	student_id UUID NOT NULL, 
	content TEXT NOT NULL, 
	file_id UUID, 
	submitted_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	is_late BOOLEAN NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	tenant_id UUID NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_submissions_assignment_student UNIQUE (assignment_id, student_id), 
	CONSTRAINT ck_submissions_status CHECK (status IN ('submitted','graded','returned')), 
	FOREIGN KEY(assignment_id) REFERENCES assignments (id) ON DELETE CASCADE, 
	FOREIGN KEY(student_id) REFERENCES students (id) ON DELETE CASCADE, 
	FOREIGN KEY(file_id) REFERENCES files (id) ON DELETE SET NULL, 
	FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
)

;


CREATE TABLE grades (
	submission_id UUID NOT NULL, 
	student_id UUID NOT NULL, 
	teacher_id UUID, 
	score FLOAT NOT NULL, 
	max_score FLOAT NOT NULL, 
	feedback TEXT NOT NULL, 
	graded_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	published_at TIMESTAMP WITH TIME ZONE, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	tenant_id UUID NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_grades_score_nonneg CHECK (score >= 0), 
	FOREIGN KEY(submission_id) REFERENCES submissions (id) ON DELETE CASCADE, 
	FOREIGN KEY(student_id) REFERENCES students (id) ON DELETE CASCADE, 
	FOREIGN KEY(teacher_id) REFERENCES teachers (id) ON DELETE SET NULL, 
	FOREIGN KEY(tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
)

;

CREATE UNIQUE INDEX ix_roles_name ON roles (name);
CREATE UNIQUE INDEX ix_tenants_slug ON tenants (slug);
CREATE INDEX ix_tenants_status ON tenants (status);
CREATE UNIQUE INDEX ix_users_email ON users (email);
CREATE INDEX ix_users_status ON users (status);
CREATE INDEX ix_audit_logs_action ON audit_logs (action);
CREATE INDEX ix_audit_logs_actor_id ON audit_logs (actor_id);
CREATE INDEX ix_audit_logs_created_at ON audit_logs (created_at);
CREATE INDEX ix_audit_logs_resource_type ON audit_logs (resource_type);
CREATE INDEX ix_audit_logs_tenant_id ON audit_logs (tenant_id);
CREATE INDEX ix_audit_tenant_created ON audit_logs (tenant_id, created_at);
CREATE INDEX ix_elab_runs_source_hash ON elab_runs (source_hash);
CREATE INDEX ix_elab_runs_status ON elab_runs (status);
CREATE INDEX ix_elab_runs_tenant_id ON elab_runs (tenant_id);
CREATE INDEX ix_elab_runs_user_id ON elab_runs (user_id);
CREATE INDEX ix_feature_flags_key ON feature_flags (key);
CREATE INDEX ix_feature_flags_tenant_id ON feature_flags (tenant_id);
CREATE UNIQUE INDEX ix_files_object_key ON files (object_key);
CREATE INDEX ix_files_owner_id ON files (owner_id);
CREATE INDEX ix_files_purpose ON files (purpose);
CREATE INDEX ix_files_tenant_id ON files (tenant_id);
CREATE INDEX ix_notifications_read_at ON notifications (read_at);
CREATE INDEX ix_notifications_recipient_id ON notifications (recipient_id);
CREATE INDEX ix_notifications_tenant_created ON notifications (tenant_id, created_at);
CREATE INDEX ix_notifications_tenant_id ON notifications (tenant_id);
CREATE INDEX ix_notifications_tenant_recipient ON notifications (tenant_id, recipient_id);
CREATE INDEX ix_notifications_type ON notifications (type);
CREATE INDEX ix_one_time_tokens_purpose ON one_time_tokens (purpose);
CREATE UNIQUE INDEX ix_one_time_tokens_token_hash ON one_time_tokens (token_hash);
CREATE INDEX ix_one_time_tokens_user_id ON one_time_tokens (user_id);
CREATE INDEX ix_parents_deleted_at ON parents (deleted_at);
CREATE INDEX ix_parents_tenant_id ON parents (tenant_id);
CREATE UNIQUE INDEX ix_refresh_tokens_jti ON refresh_tokens (jti);
CREATE INDEX ix_refresh_tokens_token_hash ON refresh_tokens (token_hash);
CREATE INDEX ix_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX ix_schools_deleted_at ON schools (deleted_at);
CREATE INDEX ix_schools_tenant_id ON schools (tenant_id);
CREATE INDEX ix_students_deleted_at ON students (deleted_at);
CREATE INDEX ix_students_status ON students (status);
CREATE INDEX ix_students_student_identifier ON students (student_identifier);
CREATE INDEX ix_students_tenant_id ON students (tenant_id);
CREATE INDEX ix_subjects_code ON subjects (code);
CREATE INDEX ix_subjects_deleted_at ON subjects (deleted_at);
CREATE INDEX ix_subjects_tenant_id ON subjects (tenant_id);
CREATE INDEX ix_subscriptions_status ON subscriptions (status);
CREATE UNIQUE INDEX ix_subscriptions_tenant_id ON subscriptions (tenant_id);
CREATE INDEX ix_teachers_deleted_at ON teachers (deleted_at);
CREATE INDEX ix_teachers_tenant_id ON teachers (tenant_id);
CREATE INDEX ix_tenant_membership_role ON tenant_membership (role);
CREATE INDEX ix_tenant_membership_status ON tenant_membership (status);
CREATE INDEX ix_tenant_membership_tenant_id ON tenant_membership (tenant_id);
CREATE INDEX ix_tenant_membership_user_id ON tenant_membership (user_id);
CREATE INDEX ix_user_roles_role_id ON user_roles (role_id);
CREATE INDEX ix_user_roles_tenant_id ON user_roles (tenant_id);
CREATE INDEX ix_user_roles_user_id ON user_roles (user_id);
CREATE UNIQUE INDEX uq_user_roles_platform ON user_roles (user_id, role_id) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX uq_user_roles_tenant ON user_roles (user_id, role_id, tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX ix_classes_academic_year ON classes (academic_year);
CREATE INDEX ix_classes_deleted_at ON classes (deleted_at);
CREATE INDEX ix_classes_name ON classes (name);
CREATE INDEX ix_classes_status ON classes (status);
CREATE INDEX ix_classes_tenant_id ON classes (tenant_id);
CREATE INDEX ix_parent_student_parent_id ON parent_student (parent_id);
CREATE INDEX ix_parent_student_student_id ON parent_student (student_id);
CREATE INDEX ix_parent_student_tenant_id ON parent_student (tenant_id);
CREATE INDEX ix_teacher_subjects_subject_id ON teacher_subjects (subject_id);
CREATE INDEX ix_teacher_subjects_teacher_id ON teacher_subjects (teacher_id);
CREATE INDEX ix_teacher_subjects_tenant_id ON teacher_subjects (tenant_id);
CREATE INDEX ix_assignments_class_id ON assignments (class_id);
CREATE INDEX ix_assignments_due_at ON assignments (due_at);
CREATE INDEX ix_assignments_status ON assignments (status);
CREATE INDEX ix_assignments_subject_id ON assignments (subject_id);
CREATE INDEX ix_assignments_teacher_id ON assignments (teacher_id);
CREATE INDEX ix_assignments_tenant_class ON assignments (tenant_id, class_id);
CREATE INDEX ix_assignments_tenant_id ON assignments (tenant_id);
CREATE INDEX ix_attendance_class_id ON attendance (class_id);
CREATE INDEX ix_attendance_date ON attendance (date);
CREATE INDEX ix_attendance_status ON attendance (status);
CREATE INDEX ix_attendance_student_id ON attendance (student_id);
CREATE INDEX ix_attendance_tenant_class ON attendance (tenant_id, class_id);
CREATE INDEX ix_attendance_tenant_created ON attendance (tenant_id, created_at);
CREATE INDEX ix_attendance_tenant_id ON attendance (tenant_id);
CREATE INDEX ix_attendance_tenant_student ON attendance (tenant_id, student_id);
CREATE INDEX ix_class_members_class_id ON class_members (class_id);
CREATE INDEX ix_class_members_teacher_id ON class_members (teacher_id);
CREATE INDEX ix_class_members_tenant_id ON class_members (tenant_id);
CREATE INDEX ix_class_subjects_class_id ON class_subjects (class_id);
CREATE INDEX ix_class_subjects_subject_id ON class_subjects (subject_id);
CREATE INDEX ix_class_subjects_tenant_id ON class_subjects (tenant_id);
CREATE INDEX ix_enrollments_class_id ON enrollments (class_id);
CREATE INDEX ix_enrollments_status ON enrollments (status);
CREATE INDEX ix_enrollments_student_id ON enrollments (student_id);
CREATE INDEX ix_enrollments_tenant_id ON enrollments (tenant_id);
CREATE INDEX ix_timetable_class_id ON timetable (class_id);
CREATE INDEX ix_timetable_day_of_week ON timetable (day_of_week);
CREATE INDEX ix_timetable_subject_id ON timetable (subject_id);
CREATE INDEX ix_timetable_teacher_id ON timetable (teacher_id);
CREATE INDEX ix_timetable_tenant_id ON timetable (tenant_id);
CREATE INDEX ix_assignment_files_assignment_id ON assignment_files (assignment_id);
CREATE INDEX ix_assignment_files_file_id ON assignment_files (file_id);
CREATE INDEX ix_assignment_files_tenant_id ON assignment_files (tenant_id);
CREATE INDEX ix_submissions_assignment_id ON submissions (assignment_id);
CREATE INDEX ix_submissions_status ON submissions (status);
CREATE INDEX ix_submissions_student_id ON submissions (student_id);
CREATE INDEX ix_submissions_tenant_id ON submissions (tenant_id);
CREATE INDEX ix_submissions_tenant_student ON submissions (tenant_id, student_id);
CREATE INDEX ix_grades_published_at ON grades (published_at);
CREATE INDEX ix_grades_student_id ON grades (student_id);
CREATE UNIQUE INDEX ix_grades_submission_id ON grades (submission_id);
CREATE INDEX ix_grades_tenant_id ON grades (tenant_id);
CREATE INDEX ix_grades_tenant_student ON grades (tenant_id, student_id);

-- Row-Level Security: every tenant-owned table + tenants. users/roles/refresh_tokens/
-- one_time_tokens are global/session-scoped by design (see docs).
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_logs FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
ALTER TABLE elab_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE elab_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON elab_runs FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON feature_flags FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE files FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON files FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notifications FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
ALTER TABLE parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE parents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON parents FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE schools FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON schools FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE students FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON students FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON subjects FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON subscriptions FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON teachers FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
ALTER TABLE tenant_membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_membership FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_membership FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON user_roles FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON classes FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
ALTER TABLE parent_student ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_student FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON parent_student FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
ALTER TABLE teacher_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_subjects FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON teacher_subjects FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON assignments FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON attendance FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
ALTER TABLE class_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_members FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON class_members FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
ALTER TABLE class_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_subjects FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON class_subjects FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON enrollments FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
ALTER TABLE timetable ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON timetable FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
ALTER TABLE assignment_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_files FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON assignment_files FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON submissions FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON grades FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_self ON tenants FOR ALL USING (id::text = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');

-- System roles (ids are uuid5(DNS, 'schoolos.local/roles/<name>')).
INSERT INTO roles (id, name, description, is_system, created_at) VALUES ('d6bbf47c-e52b-5ad3-82ea-bfaa294bcb0c', 'super-admin', '', true, now());
INSERT INTO roles (id, name, description, is_system, created_at) VALUES ('de72410b-55f3-52d0-b917-87791685390f', 'school-admin', '', true, now());
INSERT INTO roles (id, name, description, is_system, created_at) VALUES ('38cc4117-423b-5148-819a-8df3eb44ac1f', 'teacher', '', true, now());
INSERT INTO roles (id, name, description, is_system, created_at) VALUES ('ac163402-f1ff-5a5e-8ed6-21090f8f1893', 'student', '', true, now());
INSERT INTO roles (id, name, description, is_system, created_at) VALUES ('852b8e82-c98e-598f-b796-9f0ebb99c188', 'parent', '', true, now());
