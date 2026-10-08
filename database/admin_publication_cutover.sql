-- Apply only after both authenticated gateways and both clients are deployed and verified.
-- Existing Work Hour grants stay restricted.
do $$
declare source text;
begin
 foreach source in array datacell_publication_private.sources()||array['users','module_access'] loop
  if to_regclass(format('public.%I',source)) is null then continue; end if;
  execute format('alter table public.%I enable row level security',source);
  execute format('revoke all on public.%I from public,anon,authenticated',source);
  execute format('grant all on public.%I to service_role',source);
 end loop;
end $$;
