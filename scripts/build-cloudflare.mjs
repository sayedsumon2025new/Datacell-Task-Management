import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Publish browser assets only. SQL, Edge Functions, tests and repository metadata
// must stay outside the public Pages directory.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist');
const assets = [
  "index.html",
  "publication_client.js",
  "user_interface_exports.js",
  "vendor/html2canvas-1.4.1.min.js",
  "vendor/html2canvas-LICENSE.txt",
  "work_hour_approval_dashboard.html",
  "work_hour_bridge.js",
  "work_hour_entry_rules.js",
  "work_hour_eot_model.js",
  "work_hour_login.html",
  "work_hour_portal.js",
  "work_hour_tab_access.js",
  "work_hour_table_image.js"
];
for (const asset of assets) {
  if (!(await stat(resolve(root, asset))).isFile()) {
    throw new Error('Missing browser asset: ' + asset);
  }
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const asset of assets) {
  const target = resolve(output, asset);
  await mkdir(dirname(target), { recursive: true });
  await cp(resolve(root, asset), target);
}
console.log('Cloudflare Pages build ready: ' + assets.length + ' assets in dist/');
