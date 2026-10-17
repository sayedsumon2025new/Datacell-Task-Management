# Apps Script audit — 17 October 2026

## Scope and provenance

Reviewed the owner's pasted complete Code.gs and Index.html, then checked this repository's complete default-branch tree. The original repository contained no Apps Script source, manifest or clasp configuration. The repaired standalone source is introduced only under apps-script/; the root application and existing database scripts are untouched.

The connected Google Sheet was read earlier in this chat: 93 task records and 3 user records were observed. No live spreadsheet mutations, task assignments, user changes, setup, imports or deployments were performed by this repair. Test fixtures contain fictional accounts, not user records.

## Findings and changes

1. **Bootstrap Date serialization risk.** Original bootstrap returned raw getValues() results. Dates nested in an RPC response are unsupported by google.script.run. A fixture reproduces the original unsafe Date payload. The repaired response serializes timestamps to strings and formats calendar fields using the spreadsheet timezone. The existing response keys and authorization filters are preserved. The actual deployed failing payload was unavailable, so this remains a likely server-side cause rather than a proven live incident diagnosis.
2. **Confirmed frontend initialization defect.** Original reload assigned state before validating the response and immediately read r.user. draw also dereferenced state.user without a guard. Null or malformed responses could throw after the transport success callback.
3. **Callback errors escaped transport failure handling.** withFailureHandler does not catch exceptions in the client's success callback. Callback and rendering exceptions are now caught and displayed.
4. **Loading and recovery.** Missing bridge, server failure, malformed payload and 45-second timeout now end loading with an actionable message. Read-only reload is available, overlapping UI submissions are suppressed, and callbacks arriving after a timeout are ignored. The timeout does not cancel the server call; mutations are never automatically retried.
5. **Input validation gaps.** New plan minutes reject negative, non-finite and excessive values. New priorities use the existing Normal/High/Low choices. New plan, work and leave dates reject impossible calendar dates, including invalid leap days. Existing spreadsheet rows are not rewritten.

Google RPC type documentation: https://developers.google.com/apps-script/guides/html/communication

## Security behavior retained and checked locally

- Identity comes only from Session.getActiveUser(), with no owner fallback.
- Blank, unknown and inactive identities fail authorization.
- Admin-only operations retain server-side admin guards.
- Users see their own assigned tasks and requests, without the user directory.
- Completion and assignment retain version checks; cross-user completion is rejected.
- Setup refuses to replace a configured database; import refuses a populated task sheet.
- Rendered database values remain escaped in the original templates.
- Assignment to an inactive user is rejected.

Managers currently have the same task visibility as users. This is existing behavior, not a newly defined manager policy.

## Verification

42 tests passed in Node with mocked Google services and a small DOM test double. Tests exercise the actual repaired source. They cover 93-task bootstrap, three-user fixture, timezone handling, null/malformed payloads, frontend rendering, permission guards, assignments, stale versions, escaping, input validation, timeout and recovery. The script runs without npm packages or Google credentials.

These are not a real browser, an Apps Script runtime integration test, or a Google test deployment. Browser execution in this session was unavailable. The source has not been deployed to the provided Web App.

## Remaining production checks and limitations

The real manifest and deployment configuration were not provided. Active-user identity availability depends on the deployment and account context and cannot safely be repaired by assuming an administrator identity. Complete the live checklist in README.md using a separate test database/project before release.

Existing mutations write task fields and audit events in separate spreadsheet calls. A storage or audit failure can therefore leave a partially completed operation. Script locks and version checks do not provide a spreadsheet transaction or coordinate independent Apps Script projects. Confirm resulting state after errors; local tests do not establish failure-atomic storage.

Concurrent user-role revocation and mutation is not covered by these tests: original mutation functions authorize before entering the script lock. Large-sheet latency, quotas, audit storage failures and external/manual spreadsheet edits also need operational review. No claim of full production security certification is made.
