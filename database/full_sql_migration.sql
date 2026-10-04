-- Full SQL persistence migration for Datacell Task Management
-- Idempotent. Safe to run more than once.
-- Converts legacy meta/local JSON persistence into dedicated PostgreSQL tables.

begin;

create table if not exists public.app_state (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.task_completions (
  task_sl bigint not null,
  actual_date date not null,
  task text not null default '',
  person text not null default '',
  priority boolean not null default false,
  plan_date date,
  plan_time time,
  actual_time time not null,
  lead_time text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (task_sl, actual_date)
);

create table if not exists public.task_remarks (
  task_sl bigint not null,
  remark_date date not null,
  remark text not null,
  updated_at timestamptz not null default now(),
  primary key (task_sl, remark_date)
);

create table if not exists public.working_hours_defaults (
  person text primary key,
  minutes integer not null default 480 check (minutes between 0 and 1440),
  updated_at timestamptz not null default now()
);

create table if not exists public.working_hours_daily (
  person text not null,
  work_date date not null,
  minutes integer not null check (minutes between 0 and 1440),
  updated_at timestamptz not null default now(),
  primary key (person, work_date)
);

create table if not exists public.multi_skill_assignments (
  task_sl bigint primary key,
  backup_person text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  username text primary key,
  role text not null check (role in ('Section Incharge','Supervisor','Team Member')),
  updated_at timestamptz not null default now()
);

create table if not exists public.leave_applications (
  id text primary key,
  employee text not null,
  employee_role text not null default 'Team Member',
  leave_type text not null,
  duration text not null default 'single',
  from_date date not null,
  to_date date not null,
  days integer not null default 0 check (days >= 0),
  short_start_time time,
  short_end_time time,
  short_minutes integer not null default 0 check (short_minutes >= 0),
  reason text not null default '',
  supervisor_status text not null default 'Pending',
  supervisor_by text not null default '',
  supervisor_at timestamptz,
  section_status text not null default 'Pending',
  section_by text not null default '',
  section_at timestamptz,
  rejected_stage text not null default '',
  status text not null default 'Pending',
  balancing_complete boolean not null default false,
  applied_by text not null default '',
  applied_at timestamptz not null default now(),
  balanced_by text not null default '',
  balanced_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.leave_report_coverage (
  application_id text not null references public.leave_applications(id) on delete cascade,
  task_sl bigint not null,
  assignee text not null default '',
  acceptance_status text not null default 'Pending'
    check (acceptance_status in ('Pending','Accepted','Rejected')),
  responded_at timestamptz,
  responded_by text not null default '',
  updated_at timestamptz not null default now(),
  primary key (application_id, task_sl)
);

create index if not exists idx_leave_applications_employee on public.leave_applications(employee);
create index if not exists idx_leave_applications_status on public.leave_applications(status);
create index if not exists idx_leave_report_coverage_assignee on public.leave_report_coverage(assignee);
create index if not exists idx_task_completions_actual_date on public.task_completions(actual_date);
create index if not exists idx_task_remarks_date on public.task_remarks(remark_date);
create index if not exists idx_working_hours_daily_date on public.working_hours_daily(work_date);

-- Migrate system counters/state from legacy meta.
insert into public.app_state(key,value)
select key,value from public.meta where key in ('version','nextSl')
on conflict (key) do update set value=excluded.value, updated_at=now();

-- Migrate legacy completion snapshots.
insert into public.task_completions(task_sl,actual_date,task,person,priority,plan_date,plan_time,actual_time,lead_time)
select
  nullif(split_part(key,':',3),'')::bigint,
  nullif(value::jsonb->>'actualDate','')::date,
  coalesce(value::jsonb->>'task',''),
  coalesce(value::jsonb->>'person',''),
  coalesce((value::jsonb->>'priority')::boolean,false),
  nullif(value::jsonb->>'planDate','')::date,
  nullif(value::jsonb->>'planTime','')::time,
  nullif(value::jsonb->>'actualTime','')::time,
  coalesce(value::jsonb->>'leadTime','')
from public.meta
where key like 'taskCompletion:%'
  and value ~ '^\s*\{'
  and nullif(value::jsonb->>'actualDate','') is not null
  and nullif(value::jsonb->>'actualTime','') is not null
on conflict (task_sl,actual_date) do update set
  task=excluded.task, person=excluded.person, priority=excluded.priority,
  plan_date=excluded.plan_date, plan_time=excluded.plan_time,
  actual_time=excluded.actual_time, lead_time=excluded.lead_time, updated_at=now();

-- Migrate remarks.
insert into public.task_remarks(task_sl,remark_date,remark)
select
  nullif(split_part(key,':',3),'')::bigint,
  nullif(split_part(key,':',2),'')::date,
  value
from public.meta
where key like 'taskRemark:%'
  and value is not null and btrim(value) <> ''
on conflict (task_sl,remark_date) do update set remark=excluded.remark, updated_at=now();

-- Migrate daily working hours.
insert into public.working_hours_daily(person,work_date,minutes)
select
  replace(split_part(key,':',3),'%20',' '),
  nullif(split_part(key,':',2),'')::date,
  value::integer
from public.meta
where key like 'workingHoursDaily:%'
  and value ~ '^\d+$'
  and value::integer between 0 and 1440
on conflict (person,work_date) do update set minutes=excluded.minutes, updated_at=now();

-- Migrate default working hours JSON (legacy values are hours).
insert into public.working_hours_defaults(person,minutes)
select e.key, greatest(0,least(1440,round((e.value::text)::numeric*60)::integer))
from public.meta m
cross join lateral jsonb_each_text(
  case when m.value ~ '^\s*\{' then m.value::jsonb else '{}'::jsonb end
) e
where m.key='workingHours'
on conflict (person) do update set minutes=excluded.minutes, updated_at=now();

-- Migrate Multi Skill JSON.
insert into public.multi_skill_assignments(task_sl,backup_person)
select e.key::bigint,e.value
from public.meta m
cross join lateral jsonb_each_text(
  case when m.value ~ '^\s*\{' then m.value::jsonb else '{}'::jsonb end
) e
where m.key='multiSkillMap'
  and e.key ~ '^\d+$'
  and btrim(e.value) <> ''
on conflict (task_sl) do update set backup_person=excluded.backup_person, updated_at=now();

-- Migrate roles from module_access role markers.
insert into public.user_roles(username,role)
select username, substring(token from 10)
from public.module_access
cross join lateral unnest(string_to_array(coalesce(modules,''),',')) token
where token like '__role__:%'
  and substring(token from 10) in ('Section Incharge','Supervisor','Team Member')
on conflict (username) do update set role=excluded.role, updated_at=now();

-- Migrate leave applications from JSON.
insert into public.leave_applications(
  id,employee,employee_role,leave_type,duration,from_date,to_date,days,
  short_start_time,short_end_time,short_minutes,reason,
  supervisor_status,supervisor_by,supervisor_at,
  section_status,section_by,section_at,rejected_stage,status,balancing_complete,
  applied_by,applied_at,balanced_by,balanced_at
)
select
  j->>'id',
  j->>'employee',
  coalesce(j->>'employeeRole','Team Member'),
  coalesce(j->>'leaveType','Casual Leave'),
  coalesce(j->>'duration','single'),
  nullif(j->>'fromDate','')::date,
  nullif(j->>'toDate','')::date,
  coalesce(nullif(j->>'days','')::integer,0),
  nullif(j->>'shortStartTime','')::time,
  nullif(j->>'shortEndTime','')::time,
  coalesce(nullif(j->>'shortMinutes','')::integer,0),
  coalesce(j->>'reason',''),
  coalesce(j->>'supervisorStatus','Pending'),
  coalesce(j->>'supervisorBy',''),
  nullif(j->>'supervisorAt','')::timestamptz,
  coalesce(j->>'sectionStatus','Pending'),
  coalesce(j->>'sectionBy',''),
  nullif(j->>'sectionAt','')::timestamptz,
  coalesce(j->>'rejectedStage',''),
  coalesce(j->>'status','Pending'),
  coalesce(nullif(j->>'balancingComplete','')::boolean,false),
  coalesce(j->>'appliedBy',''),
  coalesce(nullif(j->>'appliedAt','')::timestamptz,now()),
  coalesce(j->>'balancedBy',''),
  nullif(j->>'balancedAt','')::timestamptz
from (
  select value::jsonb j
  from public.meta
  where key like 'leaveApplication:%' and value ~ '^\s*\{'
) x
where j ? 'id' and j ? 'employee' and j ? 'fromDate' and j ? 'toDate'
on conflict (id) do update set
  employee=excluded.employee, employee_role=excluded.employee_role, leave_type=excluded.leave_type, duration=excluded.duration,
  from_date=excluded.from_date, to_date=excluded.to_date, days=excluded.days,
  short_start_time=excluded.short_start_time, short_end_time=excluded.short_end_time,
  short_minutes=excluded.short_minutes, reason=excluded.reason,
  supervisor_status=excluded.supervisor_status, supervisor_by=excluded.supervisor_by, supervisor_at=excluded.supervisor_at,
  section_status=excluded.section_status, section_by=excluded.section_by, section_at=excluded.section_at,
  rejected_stage=excluded.rejected_stage, status=excluded.status, balancing_complete=excluded.balancing_complete,
  applied_by=excluded.applied_by, applied_at=excluded.applied_at,
  balanced_by=excluded.balanced_by, balanced_at=excluded.balanced_at, updated_at=now();

-- Migrate leave report coverage from application JSON reportAssignments/reportAcceptance.
insert into public.leave_report_coverage(
  application_id,task_sl,assignee,acceptance_status,responded_at,responded_by
)
select
  j->>'id',
  a.key::bigint,
  a.value,
  coalesce(j->'reportAcceptance'->a.key->>'status','Pending'),
  nullif(j->'reportAcceptance'->a.key->>'respondedAt','')::timestamptz,
  coalesce(j->'reportAcceptance'->a.key->>'respondedBy','')
from (
  select value::jsonb j
  from public.meta
  where key like 'leaveApplication:%' and value ~ '^\s*\{'
) x
cross join lateral jsonb_each_text(coalesce(j->'reportAssignments','{}'::jsonb)) a
where a.key ~ '^\d+$'
on conflict (application_id,task_sl) do update set
  assignee=excluded.assignee, acceptance_status=excluded.acceptance_status,
  responded_at=excluded.responded_at, responded_by=excluded.responded_by, updated_at=now();

-- Front-end currently uses a publishable/anon key. Keep permissions consistent
-- with the existing architecture. Tighten with authenticated RLS before external exposure.
grant select,insert,update,delete on
  public.app_state,
  public.task_completions,
  public.task_remarks,
  public.working_hours_defaults,
  public.working_hours_daily,
  public.multi_skill_assignments,
  public.user_roles,
  public.leave_applications,
  public.leave_report_coverage
to anon, authenticated;

alter table public.app_state enable row level security;
alter table public.task_completions enable row level security;
alter table public.task_remarks enable row level security;
alter table public.working_hours_defaults enable row level security;
alter table public.working_hours_daily enable row level security;
alter table public.multi_skill_assignments enable row level security;
alter table public.user_roles enable row level security;
alter table public.leave_applications enable row level security;
alter table public.leave_report_coverage enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'app_state','task_completions','task_remarks','working_hours_defaults',
    'working_hours_daily','multi_skill_assignments','user_roles',
    'leave_applications','leave_report_coverage'
  ]
  loop
    execute format('drop policy if exists "app_live_all" on public.%I',t);
    execute format('create policy "app_live_all" on public.%I for all to anon, authenticated using (true) with check (true)',t);
  end loop;
end $$;

commit;
