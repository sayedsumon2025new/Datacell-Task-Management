-- Atomic service-only batch; original optimistic revision checks retained.
create or replace function public.work_hour_save_entries(actor_id uuid,entries jsonb)
returns setof public.work_hour_user_interface
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
 account public.work_hour_accounts%rowtype; item jsonb;
 oldrow public.work_hour_user_interface%rowtype; nextrow public.work_hour_user_interface%rowtype;
 row_id uuid; stamp timestamptz:=clock_timestamp(); scope jsonb; old_exists boolean;
 hour_keys text[]:=array['ot_5_pm','ot_6_pm','ot_7_pm','ot_8_pm','ot_9_pm','ot_10_pm','ot_11_pm','ot_12_am','ot_1_am'];
 field text; n numeric; previous_n numeric; total_n integer;
begin
 if jsonb_typeof(entries) is distinct from 'array' or jsonb_array_length(entries) not between 1 and 200 then raise exception 'Send 1 to 200 entries';end if;
 select * into account from public.work_hour_accounts where id=actor_id for share;
 if not found or not account.active or not (account.is_admin or coalesce((account.permissions->'p7'->>'edit')::boolean,false)) then raise exception 'User Interface edit access required';end if;
 if (select count(distinct e->'row'->>'id') from jsonb_array_elements(entries)e)<>jsonb_array_length(entries) then raise exception 'Duplicate or missing entry ID';end if;
 scope:=account.permissions->'p7'->'entry_scope';
 perform id from public.work_hour_user_interface where id in (select (e->'row'->>'id')::uuid from jsonb_array_elements(entries)e) order by id for update;
 for item in select e from jsonb_array_elements(entries)e loop
  row_id:=(item->'row'->>'id')::uuid;
  select * into oldrow from public.work_hour_user_interface where id=row_id;old_exists:=found;
  if old_exists then
   if (item->>'expected_updated_at') is null or oldrow.updated_at is distinct from (item->>'expected_updated_at')::timestamptz then raise exception 'Entry changed in another session. Reload before saving.';end if;
  elsif (item->>'expected_updated_at') is not null then raise exception 'Entry no longer exists. Reload before saving.';end if;
  nextrow:=jsonb_populate_record(null::public.work_hour_user_interface,jsonb_build_object('department','','section','','level','','line_no','','buyer','','ewo','','reason_eot','','responsible_department','')||(item->'row'));
  if not account.is_admin and scope is not null and scope->>'mode'<>'all' then
   if not exists(select 1 from jsonb_array_elements(coalesce(scope->'rules','[]'))r where r->>'department'=nextrow.department and (r->>'section'='*' or r->>'section'=coalesce(nextrow.section,'')) and (r->>'level'='*' or r->>'level'=coalesce(nextrow.level,''))) then raise exception 'Entry is outside your assigned Department / Section / Level';end if;
   if old_exists and not exists(select 1 from jsonb_array_elements(coalesce(scope->'rules','[]'))r where r->>'department'=oldrow.department and (r->>'section'='*' or r->>'section'=coalesce(oldrow.section,'')) and (r->>'level'='*' or r->>'level'=coalesce(oldrow.level,''))) then raise exception 'Existing entry is outside your assigned scope';end if;
  end if;
  if nextrow.work_date is null or public.work_hour_entry_norm(nextrow.department)='' or public.work_hour_entry_norm(nextrow.section)='' then raise exception 'Date, Department and Section are required';end if;
  if public.work_hour_entry_norm(nextrow.department) in ('sewing','quality assurance') and public.work_hour_entry_norm(nextrow.section)='sewing' and (public.work_hour_entry_level(nextrow.level)='' or public.work_hour_entry_line(nextrow.line_no)='') then raise exception 'Sewing entries require Level and Line';end if;
  if not public.work_hour_entry_time_allowed(account.is_admin,nextrow.work_date,clock_timestamp()) or (old_exists and not public.work_hour_entry_time_allowed(account.is_admin,oldrow.work_date,clock_timestamp())) then raise exception 'Locked: regular users may change only today before 5:00 PM Bangladesh time';end if;
  nextrow.iron_man:=case when old_exists then oldrow.iron_man else null end;
  nextrow.ot_5_pm:=nextrow.asking_manpower;
  foreach field in array array['present_manpower','asking_manpower','asking_hour','ot_5_pm','ot_6_pm','ot_7_pm','ot_8_pm','ot_9_pm','ot_10_pm','ot_11_pm','ot_12_am','ot_1_am','iron_man','staff'] loop
   n:=(to_jsonb(nextrow)->>field)::numeric;if n<0 or n::text in ('NaN','Infinity','-Infinity') then raise exception 'Negative quantities are not allowed';end if;
  end loop;
  previous_n:=coalesce(nextrow.ot_5_pm,0);total_n:=0;
  for i in 2..array_length(hour_keys,1) loop
   n:=coalesce((to_jsonb(nextrow)->>hour_keys[i])::numeric,0);if n>previous_n then raise exception 'Hourly manpower cannot exceed the previous hour';end if;
   total_n:=total_n+n;previous_n:=n;
  end loop;
  if exists(select 1 from unnest(hour_keys[2:9]||array['staff'])k where to_jsonb(nextrow)->>k is not null) then nextrow.total_manpower:=total_n+coalesce(nextrow.staff,0);else nextrow.total_manpower:=null;end if;
  nextrow.updated_by:=account.user_name;nextrow.updated_at:=stamp;
  if old_exists then
   update public.work_hour_user_interface set work_date=nextrow.work_date,department=nextrow.department,section=nextrow.section,level=nextrow.level,line_no=nextrow.line_no,buyer=nextrow.buyer,ewo=nextrow.ewo,
    present_manpower=nextrow.present_manpower,asking_manpower=nextrow.asking_manpower,asking_hour=nextrow.asking_hour,
    ot_5_pm=nextrow.ot_5_pm,ot_6_pm=nextrow.ot_6_pm,ot_7_pm=nextrow.ot_7_pm,ot_8_pm=nextrow.ot_8_pm,ot_9_pm=nextrow.ot_9_pm,ot_10_pm=nextrow.ot_10_pm,ot_11_pm=nextrow.ot_11_pm,ot_12_am=nextrow.ot_12_am,ot_1_am=nextrow.ot_1_am,
    iron_man=nextrow.iron_man,staff=nextrow.staff,total_manpower=nextrow.total_manpower,reason_eot=nextrow.reason_eot,responsible_department=nextrow.responsible_department,updated_by=nextrow.updated_by,updated_at=stamp where id=row_id returning * into nextrow;
  else
   insert into public.work_hour_user_interface(id,work_date,department,section,level,line_no,buyer,ewo,present_manpower,asking_manpower,asking_hour,
    ot_5_pm,ot_6_pm,ot_7_pm,ot_8_pm,ot_9_pm,ot_10_pm,ot_11_pm,ot_12_am,ot_1_am,iron_man,staff,total_manpower,reason_eot,responsible_department,updated_by,updated_at)
   values(row_id,nextrow.work_date,nextrow.department,nextrow.section,nextrow.level,nextrow.line_no,nextrow.buyer,nextrow.ewo,nextrow.present_manpower,nextrow.asking_manpower,nextrow.asking_hour,
    nextrow.ot_5_pm,nextrow.ot_6_pm,nextrow.ot_7_pm,nextrow.ot_8_pm,nextrow.ot_9_pm,nextrow.ot_10_pm,nextrow.ot_11_pm,nextrow.ot_12_am,nextrow.ot_1_am,nextrow.iron_man,nextrow.staff,nextrow.total_manpower,nextrow.reason_eot,nextrow.responsible_department,nextrow.updated_by,stamp) returning * into nextrow;
  end if;
  return next nextrow;
 end loop;
end;
$$;
revoke all on function public.work_hour_save_entries(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.work_hour_save_entries(uuid,jsonb) to service_role;
