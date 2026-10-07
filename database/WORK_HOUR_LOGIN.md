# Work Hour Approval access

Standalone entry: `work_hour_login.html`. Existing main menu embeds this portal.
Login uses Supabase Auth email/password with memory-only sessions and automatic refresh.
Supabase stores passwords; profile records contain no passwords. No service key is shipped to the browser.

The first administrator uses an uncommitted private single-use 256-bit setup link, valid for seven days.
Its SHA-256 digest is held in work_hour_setup; atomic compare/update claims it before provisioning.
The setup URL fragment is removed immediately. Setup lets the owner choose email/password and profile fields.
After setup, administrator signs in normally. Administrator profiles cannot be demoted or disabled through the form.
Admins create users with Email, Password (at least 10 characters), User Name, Department,
optional Section, Designation and unique Office ID Number. Password can be reset through Edit User.
Users are provisioned by admin (no public registration interface).

The private profiles and setup table have RLS enabled and no browser grants/policies by design.
The Edge Function verifies Auth getUser on every operation and checks live active status and server-stored permissions.
Its `verify_jwt:false` setting allows the separately authenticated setup route and OPTIONS; all other routes
validate the Bearer token against Auth before processing. Only service_role can read/write module tables directly.
Existing permissive policies are inert after browser grants are revoked by work_hour_access_cutover.sql.
Apply the cutover only once portal and Edge Function are deployed.

Tab IDs: p1 Approval Request, p2 EOT/OT, p3 Department/Section Setup, p4 OT Cost,
p5 Daily Punch, p6 Line/Level, p7 User Interface. UI mirrors server View/Edit/Delete permissions.
Setup/line mappings are shared dependencies; User Interface receives only date/ID/department/section/line punch
fields for manpower matching without exposing names, salaries, or punches from restricted tabs.
Export permission controls export buttons; a viewer can still copy data they are authorized to see.
Disabling a user or reducing permissions takes effect on the next API operation and within 15 seconds in the UI.

Other legacy Datacell modules and their credential system are outside this isolated authentication migration.
Do not grant legacy browser roles access back to Work Hour data to fix an authentication error.
Tests: check_access_backend.mjs, check_login_portal.py and temporary-account live integration check.

## User Interface entry scope

In User & Tab Access, select a user, enable User Interface View/Edit, and add
allowed Department / Section / Level combinations under Data Entry Scope.
Multiple rules are supported; a rule's section and level apply only to its own
department. All sections / All levels are optional wildcards; No Level matches
rows without a level. New editable users must have at least one rule or explicit
All departments, sections & levels access. Existing users without an assigned
scope retain their previous access until the administrator assigns one.

The User Interface loads scoped rows, limits entry suggestions and line expansion,
and validates scope before batch save. Server checks apply to both the existing
row and its new values, preventing users from moving other users' rows into their
scope. Approval Request visibility remains controlled separately by its View
permission. Scope changes reach the open UI within 15 seconds; saves check the
current server profile immediately. Fast atomic batch saves remain enabled.

## Department-wise EOT & OT Status

p2 now derives its report from saved User Interface entries (the Approval Request
source) and OT Cost for the selected work date. Total TM sums Present Manpower
by department. Plan Work Hour takes the maximum Asking Work Hour. Plan TM sums
each matching time column. Utilized TM counts employees in one exclusive slot,
rounding Total OT Hour to nearest integer with .5 rounding upward; 1 hour goes
only to 6 PM, 3 hours only to 8 PM. The existing table displays 0–5 OT-hour slots;
records beyond those slots are reported in the status message. Missing dated OT
Cost remains unavailable rather than zero. Punch Out stays unassigned.

The p2 permission grants read-only, date-restricted dependency projections of
plan quantities and OT hours, without employee names, IDs or salary fields.
Full p1/p4 data access remains separate. Scoped p7 reads and writes retain their
existing guards. p2 totals, charts and CSV all use the current date and filters.


## Department EOT calculations (Book1.csv reference)

The report reads saved User Interface plans and OT Cost records by date and normalized department. Total TM sums Present Manpower; Plan Work Hour takes the maximum Asking Hour; each Plan TM sums its corresponding 5 PM–1 AM field. Rounded OT hours use half-up rounding. Punch Out at 6 PM–1 AM counts employees in exclusive 1–8 hour buckets; 5 PM Punch Out is Total TM minus every later OT bucket, including employees beyond the displayed range. Utilized TM at each later hour is remaining manpower before that hour's Punch Out. 5 PM Short/Excess is Plan TM minus Total TM; later Short/Excess is Utilized minus Plan. Missing sources remain unavailable; a negative 5 PM residual is flagged as a source mismatch.

The full report, filtered summaries, charts and CSV use all nine slots. Total OT TM remains blank because the supplied reference CSV did not populate this measure; the final Total retains Total TM. The reference CSV's static Plan Work Hour summary (10.2) conflicts with its detail rows, so the existing maximum rule is retained (13 for 03-Oct-26).

The p2 dependency projection includes the additional three plan quantities, retains the old six-slot projection for cached clients, and still excludes employee identities, salary and writes. No reference CSV rows are imported into production.


## User Interface deletion, uniqueness and deadline

The toolbar selects one required date; the row Date column is omitted from the entry/export grid. Each row has Delete. Saved-row deletions are staged until Save Changes, with Undo Delete before saving; unsaved blank drafts are simply removed. Delete permission and the existing entry scope still apply. Saved deletion + entry changes share a revision-checked atomic RPC per batch (up to 200 changes), with archived deleted row data. A failed batch preserves drafts and rolls back its database changes.

`work_hour_entry_guards.sql` installs normalized, date-specific uniqueness across Department / Section / Level / Line. Whitespace/case and numeric line/level aliases are canonicalized. Same combinations on different dates remain valid. Duplicate protection also applies to Admins and concurrent writes. The four redundant historical copies were archived in the unexposed, service-only `work_hour_private.entry_archive`; retained rows preserve all nonblank values. The cleanup aborts on conflicting nonblank values.

Regular users can add/edit/delete/save only today's entries before 17:00 Asia/Dhaka. Existing row dates and target dates are checked, so moving old rows to today cannot bypass the guard. At 17:00 the server denies changes. Admins bypass the date/time gate, while active-account checks, revisions and uniqueness remain enforced. SQL uses the live stored account and `clock_timestamp()`; UI follows a monotonic server clock supplied by the authenticated profile endpoint and updates the visible lock automatically. Cached single-row writes and the older batch RPC route through the same SQL rules.

The combined RPC and helper functions revoke PUBLIC/anon/authenticated EXECUTE, retaining service-role access through the authenticated Edge Function. Archives are not part of the Data API. No user-controlled account/time fields authorize writes.
