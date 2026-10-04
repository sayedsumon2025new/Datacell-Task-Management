# SQL Persistence Audit

Date: 2026-10-04

## Goal

Make every business-critical value persistent in Supabase/PostgreSQL, remove local-only business data, and keep the UI live/dynamic across refreshes and users.

## Existing SQL-backed sources

| Domain | SQL source |
|---|---|
| Master tasks / ownership / priority / plan date / plan time / actual date / actual time / lead time | `tasks` |
| Users / passwords / colors | `users` |
| Per-user completion status set | `done_state` |
| Module access | `module_access` |

## Legacy persistence found during audit

| Domain | Previous persistence | Dedicated SQL target |
|---|---|---|
| Historical task completions | `meta.taskCompletion:*` JSON | `task_completions` |
| Delay remarks | `meta.taskRemark:*` | `task_remarks` |
| Default working hours | `meta.workingHours` JSON + localStorage fallback | `working_hours_defaults` |
| Daily working hours | `meta.workingHoursDaily:*` | `working_hours_daily` |
| Multi Skill | `meta.multiSkillMap` JSON | `multi_skill_assignments` |
| Job role | module_access hidden marker / legacy meta | `user_roles` |
| Leave applications | `meta.leaveApplication:*` JSON | `leave_applications` |
| Leave report balancing + acceptance | nested leave JSON | `leave_report_coverage` |
| version / nextSl | `meta` | `app_state` |

## Application changes

- Dedicated SQL tables are auto-detected.
- If the full migration is present, dedicated tables are the primary read/write source.
- Legacy `meta` reads/writes remain only as a transition fallback until production migration is applied.
- Business Working Hours no longer load from localStorage.
- New users receive a SQL default working-hours row.
- Deleted users clean up role/default-hour/daily-hour/Multi-Skill dependencies.
- Multi Skill changes immediately resync active leave coverage.
- Leave application, approval stages, Short Leave fields, Report Balancing, and Multi Skill acceptance persist as structured SQL rows.
- Delayed Remarks are read/written from `task_remarks` when the dedicated schema is active.
- Historical completion snapshots are stored in `task_completions`.
- Polling remains 5 minutes, while explicit refresh/save flows read back SQL immediately.

## Migration

Run:

`database/full_sql_migration.sql`

The migration is idempotent, copies legacy data into dedicated tables, enables RLS, grants the same anon/authenticated CRUD level required by the current client-side architecture, creates updated_at triggers, and retains legacy `meta` rows as rollback/migration backup.

## Security note

The current application embeds a Supabase publishable key in a static GitHub Pages frontend and therefore depends on permissive client-access policies. The migration preserves that behavior so the current app continues to work. For stronger security, a later phase should move writes behind authenticated Supabase Auth/RLS or server-side functions.
