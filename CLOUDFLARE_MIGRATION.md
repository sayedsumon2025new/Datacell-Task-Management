# DataCell on Cloudflare Workers and D1

This branch provides a D1-backed replacement for the existing Supabase APIs.
The browser build uses the Worker's own origin for DataCell login, reports,
Work Hour authentication, permissions, entries and approvals. Runtime requests
do not contact Supabase. Original browser sources remain available for the old
GitHub Pages deployment; `npm run build` produces the Cloudflare-specific assets.

## Migration requirements

- Cloudflare account `7813d05dfb2f624fe8c9e668ad70c200` with Workers and D1 access.
- Node.js 24 or newer for scripts and SQLite-backed verification.
- Wrangler 4.149.0, pinned in the commands below.
- A complete private export directory with live tables, the current published
  snapshot, Work Hour credential hashes, archived entries and publication head.
- A Worker secret named `AUTH_SECRET`, at least 32 random characters.

Staff records and password hashes must remain outside Git and outside `dist/`.
The private export prepared during this migration lives at
`/workspace/datacell-migration-private/`; it is not included in the PR.
Existing DataCell passwords are converted to PBKDF2-SHA256 hashes. Imported
Work Hour bcrypt hashes remain valid and upgrade to PBKDF2 after a successful
login. Existing sessions are not copied; users sign in again.

## Validate before deploying

```sh
npm test
npm run build
node scripts/prepare-d1-import.mjs /absolute/path/to/private-export
```

The import helper rejects incomplete exports, repeated primary keys and mismatched
snapshot versions. It imports every statement into a fresh SQLite database,
checks table counts and writes a private `d1-import.sql` and `manifest.json`.
It replaces the exported DataCell plaintext passwords with hashes.

## Create and bind the database

Run Wrangler through the configured secure Cloudflare identity. On a local
machine you can use `npx --yes wrangler@4.149.0 login`. For a managed session,
configure `CLOUDFLARE_API_TOKEN` securely in environment settings. Do not paste
tokens into chat, browser source or Git files. The API token needs account-scoped
Workers Scripts Edit and D1 Edit permissions for the account above.

```sh
npx --yes wrangler@4.149.0 d1 create datacell-task-db
node scripts/configure-d1.mjs <database-id-returned-by-Cloudflare>
npx --yes wrangler@4.149.0 d1 migrations apply datacell-task-db --remote
npx --yes wrangler@4.149.0 d1 execute datacell-task-db --remote --file=/absolute/private-export/d1-import.sql
npx --yes wrangler@4.149.0 secret put AUTH_SECRET
```

Use a new, empty database for the import. The import uses inserts and deliberately
fails on duplicates rather than overwriting an existing installation. Keep a
record of the returned D1 ID and verified import manifest. The main SQL table
counts and the current publication must match that manifest before deployment.

## Deploy and verify

```sh
npm run build
npx --yes wrangler@4.149.0 deploy
```

For the existing Git-connected Worker, use Node.js 24, build command
`npm run build`, and deploy command `npx --yes wrangler@4.149.0 deploy`.
Do not configure this as a Pages ZIP upload: this version contains a Worker API.
Save the actual D1 UUID in `wrangler.jsonc` before enabling automatic deployment.

1. Open `/api/health` on the returned Worker URL. It must report `ready`.
2. Refresh the login page. Verify names load and the existing Admin can sign in.
3. Compare task, user, punch, OT and archive counts with the import manifest.
4. Sign in as a regular user and verify another user's task cannot be changed.
5. In Work Hour, test an existing account, its tabs, assigned entry scope and exports.
6. Test a new draft entry, stale-edit rejection and the Bangladesh 5 PM cutoff.
7. Confirm shared reports keep the migrated published snapshot until Admin publishes.
8. Verify browser Network requests go to the Worker origin, with no Supabase calls.

Keep the existing Supabase database and old Worker version until these checks
pass. Export a D1 backup before making subsequent schema changes.

## Limits and verification status

The automated backend tests use real SQLite with a D1 API adapter, including
atomic batch rollback. They cover authentication, authorization, scoped reads,
published snapshots, entry validation and optimistic concurrency. They do not
replace a live Cloudflare deployment or a browser sign-in test.

Workers Free CPU and D1 query quotas may be insufficient for first-time bcrypt
verification, large report publication or 200-row entry batches. Check the
account's plan and observed usage before switching production traffic; this
migration does not change the account's paid plan.

The port retains the existing report and permission logic while keeping password
hashes on the server. Staff data, live import SQL, credentials and generated assets
are excluded from the repository and static deployment output. No Supabase API
key or service-role key is needed by the new Worker.

References:
- https://developers.cloudflare.com/workers/static-assets/binding/
- https://developers.cloudflare.com/d1/worker-api/d1-database/
- https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
- Vendored bcrypt.js v3.0.2: https://github.com/dcodeIO/bcrypt.js/tree/v3.0.2
