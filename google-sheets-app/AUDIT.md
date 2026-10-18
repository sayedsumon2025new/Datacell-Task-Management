# Full Google Sheets edition: audit and verification

Prepared on 18 October 2026 for the owner's request to retain the complete existing dashboard and modules while replacing Supabase storage.

## Scope

The previous repository-root interface was adapted into Dashboard.html. Work Hour's portal, report bridge and all seven tabs are bundled into WorkHourPortal.html and WorkHourDashboard.html. The original root site remains available for rollback; this edition must be opened through its Apps Script Web App URL.

Server persistence and authentication run entirely in Apps Script, using a new private Google spreadsheet and Script Properties. The production package has no Supabase database URL, browser key, SDK, REST request or Edge Function dependency. Static Chart.js and fonts remain at the original external CDNs.

## Concrete safeguards

- Setup reads the existing Fresh Database; it cannot write its tabs.
- Source count defaults to 93 and is checked before destination creation.
- Task IDs, source user rows, task descriptions and all original source tabs are retained.
- The configured destination cannot be replaced by rerunning setup.
- Failed operational requests discard in-memory changes; only failed-login rate counters may persist.
- A transaction is checksummed and committed with one Storage range write under a script lock.
- Storage chunks have an explicit text prefix, preventing split JSON text from becoming a formula.
- Task writes carry revision checks; Work Hour batch writes check expected timestamps.
- Module permission changes use an atomic replacement operation.
- Server authorization checks current session, credential version, role, active status and module/tab permissions.
- Ordinary private task reads use live ownership, so reassignment revokes access before report publication.
- Ordinary users cannot reassign another task, forge historical completions, fabricate DONE markers or approve their own leave.
- Completion time is checked against the Asia/Dhaka server clock; today's saved completion locks.
- Work Hour entry scope and the 17:00 editing cutoff are enforced on the server.
- Limited EOT/Punch report contexts restrict projection, filtering and sorting to prevent inference of hidden payroll fields.
- Passwords and raw session tokens are not stored or returned in data responses.
- Removing an account revokes sessions and credentials; reusing its name does not revive the old session.
- DOMPurify 3.4.17 sanitizes legacy HTML template sinks.

## Verification evidence

**50 backend/integration tests passed.** These run the actual Core.gs and Code.gs with a mocked Apps Script/Sheets environment. They include a synthetic 93-task, three-user source and fail on any attempted source write. The actual Standalone-Code.gs bundle is also exercised, and its three decoded HTML assets are compared with the canonical source.

**24 isolated browser checks passed.** They cover admin login and overview, task assignment persistence through RPC, report publication, every main module, all seven Work Hour tabs, Work Hour User & Tab Access, ordinary-user task visibility, unauthorized writes, injected task HTML, absence of Supabase requests, absence of uncaught script errors and source immutability.

The browser used the actual application source and a real isolated Chrome engine with mocked Sheets/Apps Script services. Chart.js was represented by an API test double, so these checks do not certify actual chart visuals.

See test-results.txt and browser-test-results.txt. Re-run the dependency-free backend tests with node --test tests/full-app.test.cjs. The optional browser script documents its Playwright and Chrome environment variables in README.md.

## Limits and required live verification

No actual Google project was modified or deployed. No real database migration, task assignment or user write was performed. The observed real source contained 93 tasks and 3 users during earlier read-only inspection; all later test records are fictional.

The package must still be tested in Google's HtmlService sandbox, including nested srcdoc frames, OAuth consent, the chosen deployment audience, actual chart/font loading, exports/printing and quota behavior. Complete README.md's live checklist before production cutover.

Application sessions are custom username/password sessions, not Supabase Auth and not inferred Google-owner identity. The new deployment requires a signed-in Google account at its outer access boundary, then an active application account. Existing Fresh Database users need new application passwords; Google account passwords are neither imported nor requested.

The initial database mapping comes from Fresh Database only. Records that exist solely in the old Supabase service are not silently imported. Pending/rejected Fresh work-hour requests are retained in the private source backup rather than reinterpreted as line-level approval records.

The Storage tab is application-managed JSON. Whole-state commits favor consistent small-team operation; realistic large Punch/OT history and concurrent-use load tests are required. Locks coordinate one writer Apps Script project, not independent projects or manual Sheet edits. A timeout or post-commit error remains ambiguous to the client; reload and inspect before retrying. This is not a claim of production security certification.
