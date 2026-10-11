import './build-cloudflare.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// Keep the original GitHub Pages source intact; only the Worker build uses D1 APIs.
const indexPath=resolve(root,'dist/index.html');
let index=await readFile(indexPath,'utf8');
index=index.replace(/const SB_URL\s*=\s*'https:\/\/hqlowjnbugaehpxrqtzc\.supabase\.co';/,"const SB_URL = location.origin;");
index=index.replace(/const SB_KEY\s*=\s*'sb_publishable_[^']+';/,"const SB_KEY = '';");
index=index.replace(/function sbConfigured\(\) \{[\s\S]*?\n\}/,"function sbConfigured() { return SB_URL === location.origin; }");
if(index.includes('hqlowjnbugaehpxrqtzc.supabase.co')||!index.includes('const SB_URL = location.origin;'))throw Error('DataCell Cloudflare API build configuration failed');
await writeFile(indexPath,index);
const portalPath=resolve(root,'dist/work_hour_portal.js');
let portal=await readFile(portalPath,'utf8');
portal=portal.replace(/const SB_URL='https:\/\/hqlowjnbugaehpxrqtzc\.supabase\.co',SB_KEY='sb_publishable_[^']+';/,"const SB_URL=location.origin,SB_KEY='';");
if(portal.includes('hqlowjnbugaehpxrqtzc.supabase.co')||!portal.includes('const SB_URL=location.origin'))throw Error('Work Hour Cloudflare API build configuration failed');
await writeFile(portalPath,portal);
console.log('Worker assets use same-origin D1-backed authentication and data APIs.');
