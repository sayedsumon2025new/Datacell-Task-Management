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
