PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS "app_state" (
 "key" TEXT NOT NULL,
 "value" TEXT NOT NULL DEFAULT '',
 "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY ("key")
);
CREATE TABLE IF NOT EXISTS "published_app_state" (
 "key" TEXT,
 "value" TEXT,
 "updated_at" TEXT,
 "_publication_version" TEXT NOT NULL,
 PRIMARY KEY ("key","_publication_version")
);
CREATE TABLE IF NOT EXISTS "done_state" (
 "id" INTEGER PRIMARY KEY,
 "username" TEXT NOT NULL,
 "done_sls" TEXT NOT NULL DEFAULT '',
 UNIQUE ("username")
);
CREATE TABLE IF NOT EXISTS "published_done_state" (
 "id" INTEGER,
 "username" TEXT,
 "done_sls" TEXT,
 "_publication_version" TEXT NOT NULL,
 PRIMARY KEY ("id","_publication_version")
);
CREATE TABLE IF NOT EXISTS "leave_applications" (
 "id" TEXT NOT NULL,
 "employee" TEXT NOT NULL,
 "employee_role" TEXT NOT NULL DEFAULT 'Team Member',
 "leave_type" TEXT NOT NULL,
 "duration" TEXT NOT NULL DEFAULT 'single',
 "from_date" TEXT NOT NULL,
 "to_date" TEXT NOT NULL,
 "days" INTEGER NOT NULL DEFAULT 0,
 "short_start_time" TEXT,
 "short_end_time" TEXT,
 "short_minutes" INTEGER NOT NULL DEFAULT 0,
 "reason" TEXT NOT NULL DEFAULT '',
 "supervisor_status" TEXT NOT NULL DEFAULT 'Pending',
 "supervisor_by" TEXT NOT NULL DEFAULT '',
 "supervisor_at" TEXT,
 "section_status" TEXT NOT NULL DEFAULT 'Pending',
 "section_by" TEXT NOT NULL DEFAULT '',
 "section_at" TEXT,
 "rejected_stage" TEXT NOT NULL DEFAULT '',
 "status" TEXT NOT NULL DEFAULT 'Pending',
 "balancing_complete" INTEGER NOT NULL DEFAULT 0,
 "applied_by" TEXT NOT NULL DEFAULT '',
 "applied_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 "balanced_by" TEXT NOT NULL DEFAULT '',
 "balanced_at" TEXT,
 "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "published_leave_applications" (
 "id" TEXT,
 "employee" TEXT,
 "employee_role" TEXT,
 "leave_type" TEXT,
 "duration" TEXT,
 "from_date" TEXT,
 "to_date" TEXT,
 "days" INTEGER,
 "short_start_time" TEXT,
 "short_end_time" TEXT,
 "short_minutes" INTEGER,
 "reason" TEXT,
 "supervisor_status" TEXT,
 "supervisor_by" TEXT,
 "supervisor_at" TEXT,
 "section_status" TEXT,
 "section_by" TEXT,
 "section_at" TEXT,
 "rejected_stage" TEXT,
 "status" TEXT,
 "balancing_complete" INTEGER,
 "applied_by" TEXT,
 "applied_at" TEXT,
 "balanced_by" TEXT,
 "balanced_at" TEXT,
 "updated_at" TEXT,
 "_publication_version" TEXT NOT NULL,
 PRIMARY KEY ("id","_publication_version")
);
CREATE TABLE IF NOT EXISTS "leave_report_coverage" (
 "application_id" TEXT NOT NULL,
 "task_sl" INTEGER NOT NULL,
 "assignee" TEXT NOT NULL DEFAULT '',
 "acceptance_status" TEXT NOT NULL DEFAULT 'Pending',
 "responded_at" TEXT,
 "responded_by" TEXT NOT NULL DEFAULT '',
 "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY ("application_id","task_sl")
);
CREATE TABLE IF NOT EXISTS "published_leave_report_coverage" (
 "application_id" TEXT,
 "task_sl" INTEGER,
 "assignee" TEXT,
 "acceptance_status" TEXT,
 "responded_at" TEXT,
 "responded_by" TEXT,
 "updated_at" TEXT,
 "_publication_version" TEXT NOT NULL,
 PRIMARY KEY ("application_id","task_sl","_publication_version")
);
CREATE TABLE IF NOT EXISTS "meta" (
 "id" INTEGER PRIMARY KEY,
 "key" TEXT NOT NULL,
 "value" TEXT NOT NULL DEFAULT '',
 UNIQUE ("key")
);
CREATE TABLE IF NOT EXISTS "published_meta" (
 "id" INTEGER,
 "key" TEXT,
 "value" TEXT,
 "_publication_version" TEXT NOT NULL,
 PRIMARY KEY ("id","_publication_version")
);
CREATE TABLE IF NOT EXISTS "module_access" (
 "id" INTEGER PRIMARY KEY,
 "username" TEXT NOT NULL,
 "modules" TEXT NOT NULL DEFAULT '',
 UNIQUE ("username")
);
CREATE TABLE IF NOT EXISTS "multi_skill_assignments" (
 "task_sl" INTEGER NOT NULL,
 "backup_person" TEXT NOT NULL,
 "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY ("task_sl")
);
CREATE TABLE IF NOT EXISTS "published_multi_skill_assignments" (
 "task_sl" INTEGER,
 "backup_person" TEXT,
 "updated_at" TEXT,
 "_publication_version" TEXT NOT NULL,
 PRIMARY KEY ("task_sl","_publication_version")
);
CREATE TABLE IF NOT EXISTS "task_completions" (
 "task_sl" INTEGER NOT NULL,
 "actual_date" TEXT NOT NULL,
 "task" TEXT NOT NULL DEFAULT '',
 "person" TEXT NOT NULL DEFAULT '',
 "priority" INTEGER NOT NULL DEFAULT 0,
 "plan_date" TEXT,
 "plan_time" TEXT,
 "actual_time" TEXT NOT NULL,
 "lead_time" TEXT NOT NULL DEFAULT '',
 "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY ("task_sl","actual_date")
);
CREATE TABLE IF NOT EXISTS "published_task_completions" (
 "task_sl" INTEGER,
 "actual_date" TEXT,
 "task" TEXT,
 "person" TEXT,
 "priority" INTEGER,
 "plan_date" TEXT,
 "plan_time" TEXT,
 "actual_time" TEXT,
 "lead_time" TEXT,
 "created_at" TEXT,
 "updated_at" TEXT,
 "_publication_version" TEXT NOT NULL,
 PRIMARY KEY ("task_sl","actual_date","_publication_version")
);
CREATE TABLE IF NOT EXISTS "task_remarks" (
 "task_sl" INTEGER NOT NULL,
 "remark_date" TEXT NOT NULL,
 "remark" TEXT NOT NULL DEFAULT '',
 "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY ("task_sl","remark_date")
);
CREATE TABLE IF NOT EXISTS "published_task_remarks" (
 "task_sl" INTEGER,
 "remark_date" TEXT,
 "remark" TEXT,
 "updated_at" TEXT,
 "_publication_version" TEXT NOT NULL,
 PRIMARY KEY ("task_sl","remark_date","_publication_version")
);
CREATE TABLE IF NOT EXISTS "tasks" (
 "sl" INTEGER NOT NULL,
 "task" TEXT NOT NULL DEFAULT '',
 "person" TEXT NOT NULL DEFAULT '',
 "priority" INTEGER NOT NULL DEFAULT 0,
 "plan_date" TEXT NOT NULL DEFAULT '',
 "plan_time" TEXT NOT NULL DEFAULT '',
 "actual_date" TEXT NOT NULL DEFAULT '',
 "actual_time" TEXT NOT NULL DEFAULT '',
 "lead_time" TEXT NOT NULL DEFAULT '',
 PRIMARY KEY ("sl")
);
CREATE TABLE IF NOT EXISTS "published_tasks" (
 "sl" INTEGER,
 "task" TEXT,
 "person" TEXT,
 "priority" INTEGER,
 "plan_date" TEXT,
 "plan_time" TEXT,
 "actual_date" TEXT,
 "actual_time" TEXT,
 "lead_time" TEXT,
 "_publication_version" TEXT NOT NULL,
 PRIMARY KEY ("sl","_publication_version")
);
CREATE TABLE IF NOT EXISTS "user_roles" (
 "username" TEXT NOT NULL,
 "role" TEXT NOT NULL,
 "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY ("username")
);
CREATE TABLE IF NOT EXISTS "published_user_roles" (
 "username" TEXT,
 "role" TEXT,
 "updated_at" TEXT,
 "_publication_version" TEXT NOT NULL,
 PRIMARY KEY ("username","_publication_version")
);
CREATE TABLE IF NOT EXISTS "users" (
 "id" INTEGER PRIMARY KEY,
 "name" TEXT NOT NULL,
 "password" TEXT NOT NULL DEFAULT '',
 "color" TEXT NOT NULL DEFAULT '#60a5fa',
 UNIQUE ("name")
);
CREATE TABLE IF NOT EXISTS "work_hour_accounts" (
 "id" TEXT NOT NULL,
 "email" TEXT NOT NULL,
 "user_name" TEXT NOT NULL,
 "department" TEXT NOT NULL,
 "section" TEXT NOT NULL DEFAULT '',
 "designation" TEXT NOT NULL,
 "office_id" TEXT NOT NULL,
 "active" INTEGER NOT NULL DEFAULT 1,
 "is_admin" INTEGER NOT NULL DEFAULT 0,
 "permissions" TEXT NOT NULL DEFAULT '{}',
 "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY ("id"),
 UNIQUE ("email"),
 UNIQUE ("office_id")
);
CREATE TABLE IF NOT EXISTS "work_hour_approval_state" (
 "id" TEXT NOT NULL DEFAULT 'main',
 "report_date" TEXT,
 "rows" TEXT NOT NULL DEFAULT '[]',
 "updated_by" TEXT NOT NULL DEFAULT '',
 "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "published_work_hour_approval_state" (
 "id" TEXT,
 "report_date" TEXT,
 "rows" TEXT,
 "updated_by" TEXT,
 "updated_at" TEXT,
 "_publication_version" TEXT NOT NULL,
 PRIMARY KEY ("id","_publication_version")
);
CREATE TABLE IF NOT EXISTS "work_hour_daily_punch" (
 "id" INTEGER PRIMARY KEY,
 "work_date" TEXT NOT NULL,
 "employee_id" INTEGER NOT NULL,
 "employee_name" TEXT NOT NULL DEFAULT '',
 "designation" TEXT NOT NULL DEFAULT '',
 "doj" TEXT NOT NULL DEFAULT '',
 "department" TEXT NOT NULL DEFAULT '',
 "section" TEXT NOT NULL DEFAULT '',
 "line" TEXT NOT NULL DEFAULT '',
 "log_in" TEXT NOT NULL DEFAULT '',
 "log_out" TEXT NOT NULL DEFAULT '',
 "uploaded_by" TEXT NOT NULL DEFAULT '',
 "uploaded_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE ("work_date","employee_id")
);
CREATE TABLE IF NOT EXISTS "published_work_hour_daily_punch" (
 "id" INTEGER,
 "work_date" TEXT,
 "employee_id" INTEGER,
 "employee_name" TEXT,
 "designation" TEXT,
 "doj" TEXT,
 "department" TEXT,
 "section" TEXT,
 "line" TEXT,
 "log_in" TEXT,
 "log_out" TEXT,
 "uploaded_by" TEXT,
 "uploaded_at" TEXT,
 "updated_at" TEXT,
 "_publication_version" TEXT NOT NULL,
 PRIMARY KEY ("id","_publication_version")
);
CREATE TABLE IF NOT EXISTS "work_hour_department_sections" (
 "id" INTEGER PRIMARY KEY,
 "department" TEXT NOT NULL,
 "section" TEXT NOT NULL,
 "sort_order" INTEGER NOT NULL DEFAULT 0,
 "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE ("department","section")
);
CREATE TABLE IF NOT EXISTS "published_work_hour_department_sections" (
 "id" INTEGER,
 "department" TEXT,
 "section" TEXT,
 "sort_order" INTEGER,
 "created_at" TEXT,
 "updated_at" TEXT,
 "_publication_version" TEXT NOT NULL,
 PRIMARY KEY ("id","_publication_version")
);
CREATE TABLE IF NOT EXISTS "work_hour_ot_cost" (
 "id" INTEGER PRIMARY KEY,
 "work_date" TEXT NOT NULL,
 "employee_id" INTEGER NOT NULL,
 "employee_name" TEXT NOT NULL DEFAULT '',
 "department" TEXT NOT NULL DEFAULT '',
 "designation" TEXT NOT NULL DEFAULT '',
 "section" TEXT NOT NULL DEFAULT '',
 "line" TEXT NOT NULL DEFAULT '',
 "gross_salary" REAL,
 "ot_rate" REAL,
 "total_ot_hour" REAL,
 "regular_ot_hour" REAL,
 "extra_ot_hour" REAL,
 "regular_ot_cost" REAL,
 "extra_ot_cost" REAL,
 "total_ot_cost" REAL,
 "uploaded_by" TEXT NOT NULL DEFAULT '',
 "uploaded_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE ("work_date","employee_id")
);
CREATE TABLE IF NOT EXISTS "published_work_hour_ot_cost" (
 "id" INTEGER,
 "work_date" TEXT,
 "employee_id" INTEGER,
 "employee_name" TEXT,
 "department" TEXT,
 "designation" TEXT,
 "section" TEXT,
 "line" TEXT,
 "gross_salary" REAL,
 "ot_rate" REAL,
 "total_ot_hour" REAL,
 "regular_ot_hour" REAL,
 "extra_ot_hour" REAL,
 "regular_ot_cost" REAL,
 "extra_ot_cost" REAL,
 "total_ot_cost" REAL,
 "uploaded_by" TEXT,
 "uploaded_at" TEXT,
 "updated_at" TEXT,
 "_publication_version" TEXT NOT NULL,
 PRIMARY KEY ("id","_publication_version")
);
CREATE TABLE IF NOT EXISTS "work_hour_user_interface" (
 "id" TEXT NOT NULL,
 "work_date" TEXT,
 "department" TEXT NOT NULL DEFAULT '',
 "section" TEXT NOT NULL DEFAULT '',
 "level" TEXT NOT NULL DEFAULT '',
 "line_no" TEXT NOT NULL DEFAULT '',
 "buyer" TEXT NOT NULL DEFAULT '',
 "ewo" TEXT NOT NULL DEFAULT '',
 "present_manpower" INTEGER,
 "asking_manpower" INTEGER,
 "asking_hour" REAL,
 "ot_5_pm" INTEGER,
 "ot_6_pm" INTEGER,
 "ot_7_pm" INTEGER,
 "ot_8_pm" INTEGER,
 "ot_9_pm" INTEGER,
 "ot_10_pm" INTEGER,
 "ot_11_pm" INTEGER,
 "ot_12_am" INTEGER,
 "ot_1_am" INTEGER,
 "iron_man" INTEGER,
 "staff" INTEGER,
 "total_manpower" INTEGER,
 "reason_eot" TEXT NOT NULL DEFAULT '',
 "responsible_department" TEXT NOT NULL DEFAULT '',
 "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 "updated_by" TEXT NOT NULL DEFAULT '',
 "_identity" TEXT NOT NULL UNIQUE,
 PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "published_work_hour_user_interface" (
 "id" TEXT,
 "work_date" TEXT,
 "department" TEXT,
 "section" TEXT,
 "level" TEXT,
 "line_no" TEXT,
 "buyer" TEXT,
 "ewo" TEXT,
 "present_manpower" INTEGER,
 "asking_manpower" INTEGER,
 "asking_hour" REAL,
 "ot_5_pm" INTEGER,
 "ot_6_pm" INTEGER,
 "ot_7_pm" INTEGER,
 "ot_8_pm" INTEGER,
 "ot_9_pm" INTEGER,
 "ot_10_pm" INTEGER,
 "ot_11_pm" INTEGER,
 "ot_12_am" INTEGER,
 "ot_1_am" INTEGER,
 "iron_man" INTEGER,
 "staff" INTEGER,
 "total_manpower" INTEGER,
 "reason_eot" TEXT,
 "responsible_department" TEXT,
 "created_at" TEXT,
 "updated_at" TEXT,
 "updated_by" TEXT,
 "_publication_version" TEXT NOT NULL,
 PRIMARY KEY ("id","_publication_version")
);
CREATE TABLE IF NOT EXISTS "working_hours_daily" (
 "person" TEXT NOT NULL,
 "work_date" TEXT NOT NULL,
 "minutes" INTEGER NOT NULL,
 "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY ("person","work_date")
);
CREATE TABLE IF NOT EXISTS "published_working_hours_daily" (
 "person" TEXT,
 "work_date" TEXT,
 "minutes" INTEGER,
 "updated_at" TEXT,
 "_publication_version" TEXT NOT NULL,
 PRIMARY KEY ("person","work_date","_publication_version")
);
CREATE TABLE IF NOT EXISTS "working_hours_defaults" (
 "person" TEXT NOT NULL,
 "minutes" INTEGER NOT NULL DEFAULT 480,
 "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY ("person")
);
CREATE TABLE IF NOT EXISTS "published_working_hours_defaults" (
 "person" TEXT,
 "minutes" INTEGER,
 "updated_at" TEXT,
 "_publication_version" TEXT NOT NULL,
 PRIMARY KEY ("person","_publication_version")
);
CREATE TABLE IF NOT EXISTS publication_versions (version TEXT PRIMARY KEY, published_at TEXT NOT NULL, published_by TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS publication_head (id INTEGER PRIMARY KEY CHECK(id=1), version TEXT NOT NULL, published_at TEXT NOT NULL, published_by TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS auth_credentials (id TEXT PRIMARY KEY, password_hash TEXT NOT NULL, credential_version TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL, account_id TEXT NOT NULL, credential_version TEXT NOT NULL, expires_at INTEGER NOT NULL, refresh_hash TEXT UNIQUE, refresh_expires_at INTEGER);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS login_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, period_start INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS entry_archive (id TEXT PRIMARY KEY, original_id TEXT, row_data TEXT NOT NULL, reason TEXT NOT NULL, actor_id TEXT, archived_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS _atomic_guard (ok INTEGER NOT NULL CHECK(ok=1));
CREATE TABLE IF NOT EXISTS migration_manifest (name TEXT PRIMARY KEY, row_count INTEGER NOT NULL, sha256 TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS "work_hour_daily_punch_date" ON "work_hour_daily_punch"(work_date);
CREATE INDEX IF NOT EXISTS "published_work_hour_daily_punch_date" ON "published_work_hour_daily_punch"(_publication_version,work_date);
CREATE INDEX IF NOT EXISTS "work_hour_ot_cost_date" ON "work_hour_ot_cost"(work_date);
CREATE INDEX IF NOT EXISTS "published_work_hour_ot_cost_date" ON "published_work_hour_ot_cost"(_publication_version,work_date);
CREATE INDEX IF NOT EXISTS "work_hour_user_interface_date" ON "work_hour_user_interface"(work_date);
CREATE INDEX IF NOT EXISTS "published_work_hour_user_interface_date" ON "published_work_hour_user_interface"(_publication_version,work_date);

