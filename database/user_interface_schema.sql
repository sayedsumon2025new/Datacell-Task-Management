-- Proposed schema for the User Interface table.
-- Not applied: anonymous Data API access requires explicit user approval.
-- The existing app uses a publishable key without Supabase Auth JWTs.
create table if not exists public.work_hour_user_interface (
  id uuid primary key default gen_random_uuid(),
  work_date date null,
  department text not null default '',
  section text not null default '',
  level text not null default '',
  line_no text not null default '',
  buyer text not null default '',
  ewo text not null default '',
  present_manpower integer null check (present_manpower >= 0),
  asking_manpower integer null check (asking_manpower >= 0),
  asking_hour numeric null check (asking_hour >= 0),
  ot_5_pm integer null check (ot_5_pm >= 0),
  ot_6_pm integer null check (ot_6_pm >= 0),
  ot_7_pm integer null check (ot_7_pm >= 0),
  ot_8_pm integer null check (ot_8_pm >= 0),
  ot_9_pm integer null check (ot_9_pm >= 0),
  ot_10_pm integer null check (ot_10_pm >= 0),
  ot_11_pm integer null check (ot_11_pm >= 0),
  ot_12_am integer null check (ot_12_am >= 0),
  ot_1_am integer null check (ot_1_am >= 0),
  iron_man integer null check (iron_man >= 0),
  staff integer null check (staff >= 0),
  total_manpower integer null check (total_manpower >= 0),
  reason_eot text not null default '',
  responsible_department text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);
create index if not exists work_hour_user_interface_created_idx
  on public.work_hour_user_interface (created_at, id);
alter table public.work_hour_user_interface enable row level security;
grant select, insert, update on table public.work_hour_user_interface to anon, authenticated;
create policy work_hour_ui_select on public.work_hour_user_interface
  for select to anon, authenticated using (true);
create policy work_hour_ui_insert on public.work_hour_user_interface
  for insert to anon, authenticated with check (true);
create policy work_hour_ui_update on public.work_hour_user_interface
  for update to anon, authenticated using (true) with check (true);
