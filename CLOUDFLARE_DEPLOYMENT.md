# Deploy DataCell to Cloudflare Pages

This deploys the existing DataCell browser application. Its database, authentication,
publication API and work-hour access API continue to use the existing Supabase
project. No SQL migration is needed for this frontend hosting change.

## Git deployment

In the Cloudflare account dashboard, open **Workers & Pages → Create application →
Pages → Import an existing Git repository**, and select
`sayedsumon2025new/Datacell-Task-Management`.

Use these settings after merging the deployment preparation branch:

| Setting | Value |
| --- | --- |
| Project name | `datacell-task-management` (or another available name) |
| Production branch | `main` |
| Framework preset | None |
| Build command | `node scripts/build-cloudflare.mjs` |
| Build output directory | `dist` |
| Root directory | Repository root |
| Node.js version | 22 |

Select **Save and Deploy**. Use the actual Pages URL returned by Cloudflare.

The build copies only the browser assets. Do not publish the repository root:
it also contains SQL, backend source, and tests.

## Local build or direct upload

Run `node scripts/build-cloudflare.mjs` from the checkout. Upload only the contents
of `dist/` to a Cloudflare Pages Direct Upload project if using manual deployment.
No package installation is required.

## Verify the deployment

- Open the returned URL and confirm the main DataCell dashboard loads.
- Sign in with an existing account and confirm records load.
- Open Work Hour, sign in, and check the approval dashboard and exports.
- Confirm images, charts, and locally hosted scripts load successfully.
- Check browser Network errors for the Supabase REST and access APIs.

Cloudflare deployment credentials are not application environment variables.
Do not put a Cloudflare API token, Supabase service-role key, or user password
in browser source. Existing public client configuration is retained.

The current frontend uses password-based sign-in. If email/OAuth redirects are
enabled later, add the deployed URL to the Supabase Auth allowed redirect URLs.
If a backend function restricts allowed origins, allow the actual Pages origin
before switching users to it.

Reference: https://developers.cloudflare.com/pages/framework-guides/deploy-anything/
