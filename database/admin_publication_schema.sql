-- REVIEW DRAFT: not applied to production.
-- All gateway RPCs run as service_role after server-side authentication.
create schema if not exists datacell_publication_private;
revoke all on schema datacell_publication_private from public,anon,authenticated;
grant usage on schema datacell_publication_private to service_role;

create table datacell_publication_private.head (
 id boolean primary key default true check(id),
 version uuid not null,
 published_at timestamptz not null,
 published_by text not null
);
create table datacell_publication_private.versions (
 version uuid primary key,
 published_at timestamptz not null,
 published_by text not null
);
create table datacell_publication_private.sessions (
 token_hash text primary key,
 username text not null,
 credential_version text not null,
 expires_at timestamptz not null
);
create table datacell_publication_private.login_limits (
 username text primary key,
 attempts integer not null,
 period_start timestamptz not null
);
alter table datacell_publication_private.head enable row level security;
alter table datacell_publication_private.versions enable row level security;
alter table datacell_publication_private.sessions enable row level security;
alter table datacell_publication_private.login_limits enable row level security;
grant all on all tables in schema datacell_publication_private to service_role;

create function datacell_publication_private.sources()
returns text[] language sql immutable security invoker set search_path=''
as $$ select array[
 'tasks','done_state','meta','app_state','task_completions','task_remarks',
 'working_hours_defaults','working_hours_daily','multi_skill_assignments',
 'user_roles','leave_applications','leave_report_coverage',
 'work_hour_approval_state','work_hour_department_sections','work_hour_ot_cost',
 'work_hour_daily_punch','work_hour_user_interface'
]::text[] $$;
revoke all on function datacell_publication_private.sources() from public,anon,authenticated;
grant execute on function datacell_publication_private.sources() to service_role;

-- Typed published copies keep date/projection queries server-side.
do $$
declare source text;
begin
 foreach source in array datacell_publication_private.sources() loop
  if to_regclass(format('public.%I',source)) is null then continue; end if;
  execute format('create table datacell_publication_private.%I (like public.%I)',source,source);
  execute format('alter table datacell_publication_private.%I add column _publication_version uuid not null references datacell_publication_private.versions(version) on delete cascade',source);
  execute format('alter table datacell_publication_private.%I enable row level security',source);
  execute format('grant all on datacell_publication_private.%I to service_role',source);
  execute format('create index on datacell_publication_private.%I (_publication_version)',source);
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name=source and column_name='work_date') then
   execute format('create index on datacell_publication_private.%I (_publication_version,work_date)',source);
  end if;
 end loop;
end $$;

create function public.datacell_login(p_username text,p_password text,p_token_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare account public.users%rowtype; tries integer; start_at timestamptz; fingerprint text;
begin
 perform pg_advisory_xact_lock(hashtextextended('datacell-login:'||p_username,0));
 select attempts,period_start into tries,start_at from datacell_publication_private.login_limits where username=p_username;
 if start_at>clock_timestamp()-interval '15 minutes' and tries>=10 then
  return jsonb_build_object('error','Too many login attempts. Try again in 15 minutes.','status',429);
 end if;
 select * into account from public.users where name=p_username;
 if account.name is null or account.password is distinct from p_password or coalesce(p_password,'')='' then
  insert into datacell_publication_private.login_limits values(p_username,1,clock_timestamp())
  on conflict(username) do update set
   attempts=case when datacell_publication_private.login_limits.period_start<=clock_timestamp()-interval '15 minutes' then 1 else datacell_publication_private.login_limits.attempts+1 end,
   period_start=case when datacell_publication_private.login_limits.period_start<=clock_timestamp()-interval '15 minutes' then clock_timestamp() else datacell_publication_private.login_limits.period_start end;
  return jsonb_build_object('error','Incorrect name or password','status',401);
 end if;
 if p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid session identifier'; end if;
 fingerprint:=encode(sha256(convert_to(account.password,'UTF8')),'hex');
 delete from datacell_publication_private.login_limits where username=p_username;
 delete from datacell_publication_private.sessions where expires_at<clock_timestamp();
 insert into datacell_publication_private.sessions values(p_token_hash,account.name,fingerprint,clock_timestamp()+interval '8 hours');
 return jsonb_build_object('name',account.name,'color',account.color);
end $$;

create function public.datacell_session(p_token_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare account public.users%rowtype; session datacell_publication_private.sessions%rowtype; access text;
begin
 select * into session from datacell_publication_private.sessions where token_hash=p_token_hash and expires_at>clock_timestamp();
 if session.username is null then raise exception 'Please log in'; end if;
 select * into account from public.users where name=session.username;
 if account.name is null or session.credential_version is distinct from encode(sha256(convert_to(coalesce(account.password,''),'UTF8')),'hex') then raise exception 'Please log in'; end if;
 select modules into access from public.module_access where username=account.name;
 return jsonb_build_object('name',account.name,'color',account.color,'modules',coalesce(access,''),'is_admin',account.name='admin','credentialVersion',session.credential_version);
end $$;

create function public.datacell_logout(p_token_hash text)
returns void language sql security invoker set search_path='' as $$
 delete from datacell_publication_private.sessions where token_hash=p_token_hash
$$;

create function public.datacell_publication_head()
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('version',version,'publishedAt',published_at,'publishedBy',published_by)
 from datacell_publication_private.head where id
$$;

create function public.datacell_publish(p_actor_kind text,p_actor_id text,p_expected_version uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare source text; actor jsonb; actor_name text; current_version uuid; next_version uuid:=gen_random_uuid(); published_time timestamptz; columns text;
begin
 if p_actor_kind='datacell' then
  actor:=public.datacell_session(p_actor_id);
  if actor->>'is_admin'<>'true' then raise exception 'Administrator access required'; end if;
  actor_name:=actor->>'name';
 elsif p_actor_kind='work-hour' then
  select user_name into actor_name from public.work_hour_accounts where id=p_actor_id::uuid and active and is_admin;
  if actor_name is null then raise exception 'Administrator access required'; end if;
 else raise exception 'Unsupported administrator identity';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('datacell-publication',0));
 select version into current_version from datacell_publication_private.head where id;
 if current_version is distinct from p_expected_version then raise exception 'Reports were published by another administrator. Check the current version before publishing.'; end if;
 -- Avoid blocking entry saves. Busy sources abort without replacing the head.
 foreach source in array datacell_publication_private.sources() loop
  if to_regclass(format('public.%I',source)) is not null then execute format('lock table public.%I in share mode nowait',source); end if;
 end loop;
 published_time:=clock_timestamp();
 insert into datacell_publication_private.versions values(next_version,published_time,actor_name);
 foreach source in array datacell_publication_private.sources() loop
  if to_regclass(format('public.%I',source)) is null then continue; end if;
  select string_agg(format('%I',attname),',' order by attnum) into columns from pg_attribute where attrelid=to_regclass(format('public.%I',source)) and attnum>0 and not attisdropped;
  execute format('insert into datacell_publication_private.%I (%s,_publication_version) select %s,$1 from public.%I',source,columns,columns,source) using next_version;
 end loop;
 insert into datacell_publication_private.head values(true,next_version,published_time,actor_name)
 on conflict(id) do update set version=excluded.version,published_at=excluded.published_at,published_by=excluded.published_by;
 -- Bound storage: retain only the current and previous versions.
 delete from datacell_publication_private.versions where version not in
  (select version from datacell_publication_private.versions order by (version=next_version) desc,published_at desc limit 2);
 return public.datacell_publication_head();
end $$;

create function public.datacell_read_published(p_source text,p_query jsonb,p_version uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare columns text[]; projection text; ordering text:=''; condition text:='_publication_version=$1'; k text; v text; op text; val text; piece text; field text; direction text; amount integer; skip integer; result jsonb;
begin
 if not p_source=any(datacell_publication_private.sources()) then raise exception 'Unsupported report source'; end if;
 if to_regclass(format('datacell_publication_private.%I',p_source)) is null then raise exception 'Report source unavailable'; end if;
 if not exists(select 1 from datacell_publication_private.versions where version=p_version) then raise exception 'Published version unavailable'; end if;
 select array_agg(attname::text order by attnum) into columns from pg_attribute where attrelid=to_regclass(format('public.%I',p_source)) and attnum>0 and not attisdropped;
 if coalesce(p_query->>'select','*')='*' then projection:=(select string_agg(format('%I',c),',') from unnest(columns) c);
 else
  projection:='';
  foreach field in array string_to_array(p_query->>'select',',') loop
   if not field=any(columns) then raise exception 'Unsupported report column'; end if;
   projection:=projection||case when projection='' then '' else ',' end||format('%I',field);
  end loop;
 end if;
 for k,v in select key,value from jsonb_each_text(coalesce(p_query,'{}'::jsonb)) loop
  if k=any(array['select','order','limit','offset']) then continue; end if;
  if not k=any(columns) then raise exception 'Unsupported report filter'; end if;
  op:=split_part(v,'.',1);val:=substr(v,length(op)+2);
  if op=any(array['eq','neq','gt','gte','lt','lte','like','ilike']) then
   piece:=case op when 'eq' then '=' when 'neq' then '<>' when 'gt' then '>' when 'gte' then '>=' when 'lt' then '<' when 'lte' then '<=' when 'like' then 'like' else 'ilike' end;
   condition:=condition||format(' and %I %s %L',k,piece,case when op in ('like','ilike') then replace(val,'*','%') else val end);
  elsif op='is' and val='null' then condition:=condition||format(' and %I is null',k);
  elsif op='in' and val ~ '^\([^()]*\)$' then
   piece:=(select string_agg(format('%L',item),',') from unnest(string_to_array(substr(val,2,length(val)-2),',')) item);
   condition:=condition||format(' and %I in (%s)',k,piece);
  else raise exception 'Unsupported report operator'; end if;
 end loop;
 foreach piece in array string_to_array(coalesce(p_query->>'order',''),',') loop
  if piece='' then continue; end if;
  field:=split_part(piece,'.',1);direction:=coalesce(nullif(split_part(piece,'.',2),''),'asc');
  if not field=any(columns) or direction not in ('asc','desc') or array_length(string_to_array(piece,'.'),1)>2 then raise exception 'Unsupported report order'; end if;
  ordering:=ordering||case when ordering='' then ' order by ' else ',' end||format('%I %s',field,direction);
 end loop;
 amount:=least(10000,greatest(1,coalesce((p_query->>'limit')::integer,1000)));skip:=greatest(0,coalesce((p_query->>'offset')::integer,0));
 execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from (select %s from datacell_publication_private.%I where %s%s limit %s offset %s) r',projection,p_source,condition,ordering,amount,skip) into result using p_version;
 return result;
end $$;

revoke all on function public.datacell_login(text,text,text),public.datacell_session(text),public.datacell_logout(text),public.datacell_publication_head(),public.datacell_publish(text,text,uuid),public.datacell_read_published(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.datacell_login(text,text,text),public.datacell_session(text),public.datacell_logout(text),public.datacell_publication_head(),public.datacell_publish(text,text,uuid),public.datacell_read_published(text,jsonb,uuid) to service_role;
-- Production cutover revocations are separate and must follow gateway/client deployment.
create function public.datacell_replace_users(p_token_hash text,p_rows jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare actor jsonb;
begin
 actor:=public.datacell_session(p_token_hash);
 if actor->>'is_admin'<>'true' then raise exception 'Administrator access required'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>10000 or not exists(select 1 from jsonb_array_elements(p_rows) r where r->>'name'='admin' and length(r->>'password')>0) then raise exception 'Valid administrator record required'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r where coalesce(r->>'name','')='' or coalesce(r->>'password','')='') then raise exception 'Name and password required'; end if;
 if (select count(distinct r->>'name') from jsonb_array_elements(p_rows) r)<>jsonb_array_length(p_rows) then raise exception 'Duplicate account name'; end if;
 insert into public.users(name,password,color) select name,password,color from jsonb_to_recordset(p_rows) as x(name text,password text,color text)
 on conflict(name) do update set password=excluded.password,color=excluded.color;
 delete from public.users where name not in(select r->>'name' from jsonb_array_elements(p_rows) r);
end $$;
revoke all on function public.datacell_replace_users(text,jsonb) from public,anon,authenticated;
grant execute on function public.datacell_replace_users(text,jsonb) to service_role;
