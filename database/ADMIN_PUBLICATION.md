# Admin-controlled reports: deployment proposal

Status: prepared and tested locally; NOT deployed. Do not merge the frontend or run these SQL files independently. Review the complete rollout before changing production.

## Result

Datacell and Work Hour share one published report version. Users save entries to the existing live tables. Reports keep showing the last publication until a server-verified administrator clicks **PUBLISH REPORTS** in either app. Publishing reads the database, never a client's editable copy. CSV uploads also remain unpublished until publication.

The main app keeps existing names and passwords and validates them on the server. Short-lived opaque sessions stay in memory. Credentials are excluded from snapshots and ordinary user responses. Admin user management remains available. Work Hour retains its current Supabase Auth, permissions, entry deadlines, revision checks and SQL write guards; its deployed v7 handler is the patch baseline.

Users can still press browser F5, but it only retrieves an authorized published version. Editors can read current data needed for their own permitted entry work. Background database polling remains disabled. Work Hour checks the publication head when a report is opened; main Datacell loads the current publication on login. Already-open reports do not receive automatic updates; reopen the app/report to see a new publication. Publishing does not reset or discard open entry forms.

Repeated report loads send a small authenticated version check and reuse an AES-GCM encrypted browser cache where available. First loads, new publications, uploads, saves, authentication and permission checks still use bandwidth. Publishing retains only the current and previous snapshot, adds database storage, and briefly locks source writes. A busy source or competing publication fails atomically and can be retried; it does not expose a partial report.

## Production changes requiring review

1. Add a private snapshot/session/rate-limit schema and service-only RPCs; create an initial report snapshot from existing data. Existing source rows, names and passwords are preserved.
2. Deploy the new `datacell-access` gateway and the patched `work-hour-access` handler, both with platform JWT verification disabled because each handler verifies its own existing authentication. Service-role credentials remain server-only.
3. Deploy the coordinated frontend changes.
4. Enable RLS and revoke direct public/anon/authenticated access on report sources, users and module_access, retaining service_role access. This step is necessary to prevent bypassing Admin publication by calling the old REST endpoints.

Existing browser tabs must be reopened after the cutover. No quota reset, plan upgrade or billing change is included.

## Rollout order and stop conditions

Before deployment, record the exact source-table ACLs and RLS state, save both production Edge function sources/settings and the Pages commit, and confirm expected columns against production metadata. Keep these rollback artifacts outside the public repository. Stop if these checks fail or any deployed source differs unexpectedly.

Apply `admin_publication_schema.sql` and `admin_publication_initialize.sql` together in one database migration transaction. Deploy both gateways and check login, permission rejection, live save receipts and published reads in a controlled test. Merge/deploy the frontend only after both gateways work. Verify Pages serves the new asset versions and both user/admin flows work. Finally apply `admin_publication_cutover.sql` in a separate migration and confirm raw anon/authenticated REST access is denied. Repeat save-without-publish and Admin Publish checks after cutover. Run security advisors.

Do not use a real user's credentials for testing. Any temporary production test account or source write must be included in the reviewed deployment scope and cleaned up. Local tests use synthetic data only.

## Rollback

Preserve all live entry data. Restore the recorded grants/RLS state and previous gateway/frontend versions together if the new access path fails; keep existing Work Hour restrictions intact. Do not grant blanket public access or drop source tables. Private snapshots/session tables can remain unused while rollback is checked. Removing the private schema is a separate cleanup, after no deployed caller uses it.

## Validation

From `tests/admin-publication`: install pinned dependencies, then `npm test` (Node 24 supports `--experimental-strip-types`). Tests run real embedded PostgreSQL, the actual SQL functions and both actual gateway handlers. They cover server login, private RPC grants, forged-admin rejection, atomic publication, saved-but-unpublished entries, shared publication from either administrator, permitted live editors, cache authorization, account deactivation, credential revocation, logout, atomic user maintenance, query projection/filtering and SQL injection rejection.

Chromium tests with synthetic fixture data also passed: current main login; user Publish/Reload hidden; Save reaches live tables while reports remain old; relogin does not bypass publication; Admin Publish exposes the saved completion; Work Hour entry remains accessible. No browser script errors were observed.

## October 10 limitation

Earlier usage showed repeated full-table reads from polling and substantial punch/OT downloads. Removing polling and caching authorized published reports reduces future transfer, but the already accrued 12.19 GB remains above the stated 5.5 GB enforcement threshold. These changes alone cannot guarantee that Supabase will not restrict the free project on October 10; confirm the grace/reset/support status separately. A free architecture still has quotas.
