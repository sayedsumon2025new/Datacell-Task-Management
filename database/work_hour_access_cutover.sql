-- Work Hour data is served only by work-hour-access after authentication.
-- Existing Datacell users continue using other modules; this module opens its own login.
revoke all on public.work_hour_approval_state,public.work_hour_department_sections,
 public.work_hour_ot_cost,public.work_hour_daily_punch,public.work_hour_user_interface
 from public,anon,authenticated;
grant all on public.work_hour_approval_state,public.work_hour_department_sections,
 public.work_hour_ot_cost,public.work_hour_daily_punch,public.work_hour_user_interface
 to service_role;
