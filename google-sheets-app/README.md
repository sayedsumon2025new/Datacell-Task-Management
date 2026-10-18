# DataCell full dashboard — Google Sheets edition

This preserves the existing dashboard and module UI, replacing database calls with Apps Script RPC and a private Google spreadsheet. No Supabase endpoint, key, SDK, SQL server or Edge Function is needed by this edition.

## Easiest install

Use **Standalone-Code.gs**. It contains the server and compressed copies of all three HTML pages. Paste its complete contents into the default Code.gs of a **new standalone Apps Script test project**. No HTML files are needed for this installation.

The separate Core.gs, Code.gs and three HTML files are the readable source. Use either the standalone file or the separate files in a project, never both.

1. Create a new test project at https://script.google.com/.
2. Paste Standalone-Code.gs into Code.gs and save.
3. In Project Settings → Script Properties, add:
   - DATACELL_SOURCE_SHEET_ID: the existing **DataCell - Fresh Database** spreadsheet ID, taken from its /d/ID/edit URL.
   - DATACELL_INITIAL_ADMIN_PASSWORD: a new, unique application password with at least 12 characters. Do not use your Google account password.
4. Run **setupFullDashboard_** from the editor and authorize spreadsheet access. This is a private helper and cannot be invoked through google.script.run.
5. Setup checks that the source has 93 tasks, then creates a **different private spreadsheet**. It never writes to the source. A configured destination cannot be replaced by running setup again.
6. Deploy a test Web App running **as you**, initially accessible only to yourself. Open its Web App URL, choose admin and enter the password from step 3.
7. Set application passwords for the copied ordinary accounts in Settings → User Management. Existing Fresh Database users have no application passwords to reuse; they start with unguessable generated credentials until the administrator provisions them.
8. Assign module access. In Work Hour Approval → User & Tab Access, configure the seven tab permissions and entry scope. No ordinary Work Hour access is granted automatically.
9. Finish the live checklist below before exposing a production deployment to users.

The supplied manifest uses V8, Asia/Dhaka, spreadsheet access only, execution as the deploying user, and a signed-in Google audience. It does not allow anonymous Google access. Review and choose the deployment audience appropriate to your organization.

For the separate-source installation, create Core.gs, Code.gs, Dashboard.html, WorkHourPortal.html and WorkHourDashboard.html with their exact names, and copy appsscript.json into the manifest editor.

## Preserved modules

Overview, Master Tasks, Delete, KPI, Multi Skill, All Tasks, Working Hours, Leave Management and Settings. Work Hour retains Approval Request, EOT/OT Status, Department & Section Setup, OT Cost Data, Daily Punch Report, Line & Level Settings, User Interface, and User & Tab Access.

The Work Hour portal inherits the already authenticated dashboard session. Its former provider-specific second login has been replaced with the same application account and server-enforced tab permissions.

## Data mapping and preservation

- The source spreadsheet, source users and all 93 task rows stay unchanged.
- Source legacy-N task IDs are retained as source_id and mapped to stable numeric task numbers.
- Current assignee emails map to the source user registry. Unassigned tasks remain unassigned.
- Every complete source task and user row is preserved in source_record.
- All source tabs are additionally retained in a private sourceBackup.
- Approved personal work-hour requests are reflected in daily working hours. Pending/rejected requests remain preserved in sourceWorkHourRequests and the original tab backup; they are not converted into a different approval workflow.
- Fresh leave requests map to leave applications, with the original row attached.
- An account/name collision, unknown assignee, multiple source administrators or changed task count stops setup for explicit review.
- Data that exists only in Supabase is **not fetched or automatically migrated**. Existing CSV import controls can import historical OT Cost and Punch reports into the new storage after review.

## Storage and security

The destination is a Google Sheet in the owner's Drive. Its Storage tab contains checksummed, prefixed JSON chunks rather than editable task cells. This keeps one application transaction, its audit events and session changes in a single range write. Do not manually edit the Storage tab; make a private spreadsheet copy for backup or rollback.

The application uses memory-only client sessions, hashed session tokens, fresh role/active checks on each request, rate-limited login, and salted password hashes keyed by a random secret in Script Properties. No password or credential hash is returned to clients. Keep the spreadsheet and script editor private; do not share them with application users.

The password pepper is essential for existing passwords. Preserve Script Properties when backing up the project. For administrator recovery, set DATACELL_INITIAL_ADMIN_PASSWORD to a new 12+ character password and run resetFullDashboardAdminPassword_ in the editor. Existing admin sessions are invalidated.

DOMPurify 3.4.17 is bundled to protect the legacy HTML template sinks. Chart.js 4.4.1 remains at the original public CDN; it is a chart library, not a database. Google Fonts may also load as in the original interface.

## Tests

From this folder, with Node.js:

```sh
node --test tests/full-app.test.cjs
node build.cjs
```

The backend suite uses synthetic data, mocked Apps Script/Sheets services and the actual production source. Browser checks use isolated Chromium/Chrome, the same mocked server and a Chart API test double. They do not contact the real database.

To run optional browser checks, make a Playwright installation available through PLAYWRIGHT_MODULE and set CHROME_EXECUTABLE if needed, then run node tests/browser-smoke.cjs. Neither dependency is needed to use the Apps Script app or run backend tests.

## Live release checklist — not yet run on Google

- [ ] Run setup against a private source/test copy and confirm 93 task rows, user values and source IDs.
- [ ] Confirm the original spreadsheet values remain unchanged.
- [ ] Sign in as admin and two different ordinary accounts.
- [ ] Assign a copied task, publish reports, and confirm only the correct user receives it.
- [ ] Exercise create, edit, complete, stale-write conflicts and explicit delete.
- [ ] Check user creation/password changes and immediate disable/revocation.
- [ ] Exercise leave submission and both approval stages with real roles.
- [ ] Exercise working hours and each of the seven Work Hour tabs.
- [ ] Import small OT/Punch CSV samples and compare totals with the source files.
- [ ] Verify p7 entry scope, current-day editing and the 17:00 Asia/Dhaka cutoff.
- [ ] Test export, actual chart rendering, printing and nested frames in the Google HtmlService sandbox.
- [ ] Test realistic data size, concurrent users, Apps Script quotas and timeout recovery.
- [ ] Review the deployment audience, preserve rollback versions and only then cut over the public entry point.

A timed-out save may have reached the server; reload and check before repeating. App locks coordinate one Apps Script project only. Use one writer project for a destination spreadsheet.

This package has not been deployed to the owner's Google project. The repository-root website remains the previous edition until a verified Google Web App URL is deliberately chosen for cutover.
