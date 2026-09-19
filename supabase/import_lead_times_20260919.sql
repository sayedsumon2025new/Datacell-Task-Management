-- One-time lead-time import from the supplied 98-row image.
-- Run in your project's Supabase SQL Editor as the project owner.
-- Updates ONLY lead_time; never changes task names, owners or assignments.
-- Case/whitespace matching only. Missing and duplicate names are skipped.
-- Does not change RLS, grants, policies, or authentication.
-- Re-running will reapply this source list; do not rerun after future manual edits.
WITH source(task_name, minutes) AS (
VALUES
  ('Cutting Efficiency', 30),
  ('RIB Cut Pannel Inspection report', 65),
  ('Embroidery Efficiency Report', 30),
  ('Quality Printing-DHU Audit Pass Report.', 85),
  ('Quality Embroidery- DHU Audit Pass Report.', 85),
  ('Finishing Efficiency Report', 15),
  ('Pack Carton Update in ERP', 120),
  ('Line Wise attendance 45 Team Excel', 35),
  ('Attendance In ERP (HRMS)', 15),
  ('NPT Collect-Level-04', 15),
  ('Line Behind Report', 15),
  ('Teams Report', 15),
  ('RMG Line Status (Idle status Report)', 5),
  ('QCO 1st Five Days Efficiency Report', 58),
  ('QCO Actual Feeding Report.', 30),
  ('Line Feeding Status Pending Summary', 10),
  ('Daily loss Hour update in ERP', 20),
  ('Daily NPT Update in ERP', 20),
  ('FR Plan Update Line Wise In ERP', 35),
  ('Style Wise Machine Update In ERP', 20),
  ('Daily NPT variance report', 15),
  ('Auto Motion Report Update', 50),
  ('Daily 1st Ten Hour Report', 50),
  ('Hourly CTPAT Report', 50),
  ('Night & Day Final SAH', 20),
  ('NPT Sheet Collect-Level-03', 15),
  ('ERP Manpower Realised', 20),
  ('Idle & Partial Loss SAH Analysis', 50),
  ('QCO Activity', 120),
  ('Daily Line wise plan vs Actual Summary with behind Reason( COO SIR)', 10),
  ('IE wise & GL Wise dashboard', 10),
  ('TM Release summary', 10),
  ('Daily Head count Report', 10),
  ('Plan VS Actual Feeding status', 35),
  ('Feeding GAP report', 15),
  ('Daily sewing Capacity Utilization Report', 10),
  ('FR Plan Update In Forecast File', 25),
  ('Actual Feeding Gantt Chart', 30),
  ('Plan VS Actual Working Hour Status In ERP', 15),
  ('Buyer Wise Efficiency Dashboard', 15),
  ('Hourly Production Collect & Update In ERP-Level-04', 15),
  ('Wash output Data Update', 15),
  ('Daily Sewing Event Closed', 15),
  ('Individual iron efficiency report', 45),
  ('Hourly Excel 47 Line Production report', 225),
  ('Hourly Production Collect & Update In ERP-Level-03', 420),
  ('Forecast vs Actual Dashboard', 15),
  ('Forecast summary', 35),
  ('Sewing Reject Update in ERP', 45),
  ('Andon Report', 10),
  ('Target Vs Actual Efficiency Behind Reason Summary', 35),
  ('Work Hour Approval report', 35),
  ('ERP Sewing Input Allocation (47 Line)', 340),
  ('Forecast File Actual Output', 25),
  ('Inventory', 30),
  ('Sudden Plan Summary', 15),
  ('Upcoming Style Status', 15),
  ('Order Closing Analysis', 180),
  ('Sewing Rejection Update Tracking', 15),
  ('Printing Efficiency Report', 30),
  ('TQM Board Update (level-04)', 15),
  ('TQM Board Update (level-03)', 15),
  ('1st Output Audit Report', 30),
  ('Finishing Rejection Update Tracking', 15),
  ('Section Wise Efficiency Chart', 15),
  ('OT Cost Analysis', 45),
  ('GPQ Po Wise Inspection Update', 15),
  ('Line Wise Spot Report', 38),
  ('Cut panel audit report', 140),
  ('Daily Basis Line Wise Oil Report Summary', 15),
  ('Finishing Rejection Update in ERP', 45),
  ('Sub department wise quality NPT Update (Excel)', 20),
  ('CPI Inspection Update In ERP', 104),
  ('Daily Touchup report', 15),
  ('Daily Red dot report', 46),
  ('Contamination report', 15),
  ('DHU Report- End Line', 60),
  ('DHU Report- Finishing', 60),
  ('DHU Report- Inline', 52),
  ('Hourly Audite report', 30),
  ('Garments Rejection', 72),
  ('Rejection Hard copy file up', 30),
  ('DHU Audit report', 50),
  ('Quality Accessories DHU Report', 15),
  ('Collar And Cuff Report', 64),
  ('Size Set Production report', 15),
  ('Operation Dashboard', 20),
  ('Sewing Efficiency Email', 20),
  ('Block wise summary', 45),
  ('Feeding & EWO Spilt Status', 15),
  ('Sample MRS Update & ERP Update', 32),
  ('QCO Summary Dashboard', 30),
  ('Target Vs Actual Day Wise Pcs Summary', 15),
  ('EKWL-HW Day Wise SAH & Efficiency Drop Summary With Reason', 15),
  ('Less Eff & Opportunity Loss', 15),
  ('Sample Display update (Level-3)', 20),
  ('Embellishment Out side', 45),
  ('Sample Display update (Level-4)', 20)
),
source_keys AS (
  SELECT *, lower(regexp_replace(btrim(task_name), '\s+', ' ', 'g')) AS name_key
  FROM source
),
source_counted AS (
  SELECT *, count(*) OVER (PARTITION BY name_key) AS source_count
  FROM source_keys
),
target_keys AS (
  SELECT sl, task, lead_time,
    lower(regexp_replace(btrim(task), '\s+', ' ', 'g')) AS name_key
  FROM public.tasks
),
target_counted AS (
  SELECT *, count(*) OVER (PARTITION BY name_key) AS target_count
  FROM target_keys
),
matched AS (
  SELECT s.task_name, s.minutes, t.sl, t.task, t.lead_time
  FROM source_counted s
  JOIN target_counted t USING (name_key)
  WHERE s.source_count = 1 AND t.target_count = 1
),
updated AS (
  UPDATE public.tasks t
  SET lead_time = m.minutes::text || 'min'
  FROM matched m
  WHERE t.sl = m.sl
    AND t.task = m.task
    AND t.lead_time IS NOT DISTINCT FROM m.lead_time
    AND t.lead_time IS DISTINCT FROM (m.minutes::text || 'min')
  RETURNING t.sl, t.task, t.lead_time
)
SELECT s.task_name AS source_task, s.minutes AS requested_minutes,
  m.sl AS matched_task_id,
  CASE
    WHEN s.source_count <> 1 THEN 'SKIPPED: duplicate source name'
    WHEN NOT EXISTS (SELECT 1 FROM target_counted t WHERE t.name_key = s.name_key)
      THEN 'SKIPPED: no exact name match'
    WHEN EXISTS (SELECT 1 FROM target_counted t WHERE t.name_key = s.name_key AND t.target_count > 1)
      THEN 'SKIPPED: duplicate database name'
    WHEN u.sl IS NOT NULL THEN 'UPDATED'
    WHEN m.lead_time = s.minutes::text || 'min' THEN 'ALREADY CORRECT'
    ELSE 'NOT UPDATED: inspect policy, trigger, or concurrent change'
  END AS result,
  COALESCE(u.lead_time, m.lead_time) AS resulting_lead_time
FROM source_counted s
LEFT JOIN matched m ON m.task_name = s.task_name
LEFT JOIN updated u ON u.sl = m.sl
ORDER BY s.task_name;
