# DataCell Apps Script repair

This directory contains the standalone Google Sheets + Apps Script source supplied by the project owner, with a repair for bootstrap serialization and frontend initialization. It is separate from the application at the repository root.

## Files

- `Code.gs`: complete server source, including existing setup/import/assignment functions.
- `Index.html`: complete HTML-service frontend.
- `tests/bootstrap.test.cjs`: dependency-free Node regression tests using synthetic data and mocked Sheets, DOM and Google RPC services.
- `AUDIT.md`: findings, test evidence and outstanding release checks.

Run tests from the repository root:

```sh
node apps-script/tests/bootstrap.test.cjs
```

## Apply to an isolated test project

1. Keep the existing production spreadsheet and its Script Properties unchanged.
2. Make a private copy of the complete database for testing, including all tabs. Compare task IDs, user records and task count with the original before testing.
3. Create a separate Apps Script test project. Paste the complete contents of `Code.gs` and `Index.html` into files with those names.
4. Set the test project's `DATACELL_SHEET_ID` Script Property to the copied spreadsheet ID. Do not run setupFreshDatacell or importExisting93Tasks to repair an existing database.
5. Preserve the real project's manifest and deployment settings for review. No appsscript.json or clasp configuration was supplied, so none has been invented here.
6. Use a test deployment of the test project. The editor-only /dev test URL is useful for the owner; a separate access-restricted test deployment is needed for accounts that are not project editors.
7. Check that Session.getActiveUser().getEmail() returns the actual signed-in test user's identity. A blank identity must fail closed. Never substitute the script owner's email or a client-provided email.
8. Verify the release checklist below before considering a production update.

## Live release checklist — not yet executed

- [ ] Owner Dashboard shows the original 93-task baseline in the private test copy; counts and status totals match the copied data.
- [ ] Task List displays every expected ID without console errors.
- [ ] Active admin can see Users and assign a copied task to an active user.
- [ ] Assignment increments only that task's version and writes the expected audit event.
- [ ] Assignee sees the assigned task; an unrelated user cannot read or complete it.
- [ ] Non-admin assignment, user creation and request review fail on the server.
- [ ] Manager retains existing own-task behavior; no extra manager privileges are introduced.
- [ ] Unknown, inactive and identity-unavailable accounts cannot receive operational data.
- [ ] Work hour and leave requests work and remain visible only to their owner or admin.
- [ ] Calendar dates retain the spreadsheet's timezone; timestamps remain serializable.
- [ ] Stale-version requests fail; failed loads show an error and Reload data recovers.
- [ ] After a mutation timeout, reload and inspect saved data before resubmitting.
- [ ] Actual manifest, OAuth scopes, deployment audience and execute-as settings are reviewed.
- [ ] Original database task IDs, user records and values remain unchanged after testing.

## Production

Merging this directory does not deploy Apps Script. No deployment automation or credentials are included. Production is not release-approved by the local tests. After the live checklist passes, preserve rollback source/version information and separately review the production deployment update.
