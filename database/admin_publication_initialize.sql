-- Initial published version, captured during the reviewed deployment.
-- Does not change original business rows.
do $$
declare source text; columns text; version uuid:=gen_random_uuid(); published_at timestamptz:=clock_timestamp();
begin
 if exists(select 1 from datacell_publication_private.head) then raise exception 'Initial publication already exists'; end if;
 foreach source in array datacell_publication_private.sources() loop
  if to_regclass(format('public.%I',source)) is not null then execute format('lock table public.%I in share mode nowait',source); end if;
 end loop;
 insert into datacell_publication_private.versions values(version,published_at,'Initial deployment snapshot');
 foreach source in array datacell_publication_private.sources() loop
  if to_regclass(format('public.%I',source)) is null then continue; end if;
  select string_agg(format('%I',attname),',' order by attnum) into columns from pg_attribute where attrelid=to_regclass(format('public.%I',source)) and attnum>0 and not attisdropped;
  execute format('insert into datacell_publication_private.%I (%s,_publication_version) select %s,$1 from public.%I',source,columns,columns,source) using version;
 end loop;
 insert into datacell_publication_private.head values(true,version,published_at,'Initial deployment snapshot');
end $$;
