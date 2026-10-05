-- Work Hour Approval shared persistence
create table if not exists public.work_hour_approval_state (
  id text primary key default 'main',
  report_date date null,
  rows jsonb not null default '[]'::jsonb,
  updated_by text not null default '',
  updated_at timestamptz not null default now(),
  constraint work_hour_approval_rows_array check (jsonb_typeof(rows) = 'array')
);

alter table public.work_hour_approval_state enable row level security;
grant select, insert, update on table public.work_hour_approval_state to anon, authenticated;

drop policy if exists "work_hour_approval_select" on public.work_hour_approval_state;
create policy "work_hour_approval_select" on public.work_hour_approval_state
for select to anon, authenticated using (true);

drop policy if exists "work_hour_approval_insert" on public.work_hour_approval_state;
create policy "work_hour_approval_insert" on public.work_hour_approval_state
for insert to anon, authenticated with check (id = 'main');

drop policy if exists "work_hour_approval_update" on public.work_hour_approval_state;
create policy "work_hour_approval_update" on public.work_hour_approval_state
for update to anon, authenticated using (id = 'main') with check (id = 'main');

insert into public.work_hour_approval_state (id, rows, updated_by)
values ('main', '[]'::jsonb, 'system')
on conflict (id) do nothing;
