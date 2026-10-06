-- Profiles and permissions are managed exclusively by the authenticated Edge API.
create table if not exists public.work_hour_accounts (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null unique,
 user_name text not null check (length(trim(user_name))>0),
 department text not null check (length(trim(department))>0),
 section text not null default '',
 designation text not null check (length(trim(designation))>0),
 office_id text not null unique check (length(trim(office_id))>0),
 active boolean not null default true,
 is_admin boolean not null default false,
 permissions jsonb not null default '{}',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.work_hour_accounts enable row level security;
revoke all on public.work_hour_accounts from public,anon,authenticated;
grant all on public.work_hour_accounts to service_role;
create table if not exists public.work_hour_setup (
 id boolean primary key default true check(id),
 token_hash text not null,
 expires_at timestamptz not null,
 claimed_at timestamptz
);
alter table public.work_hour_setup enable row level security;
revoke all on public.work_hour_setup from public,anon,authenticated;
grant all on public.work_hour_setup to service_role;
-- Existing report rows remain unchanged. Browser requests use authenticated Edge API.
-- Apply this cutover only after the portal is deployed.
