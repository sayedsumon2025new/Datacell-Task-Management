import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const id=process.argv[2];
if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id||''))throw Error('Usage: node scripts/configure-d1.mjs <real-D1-database-UUID>');
const file=resolve(dirname(fileURLToPath(import.meta.url)),'../wrangler.jsonc');
const config=JSON.parse(await readFile(file,'utf8'));config.d1_databases[0].database_id=id;
await writeFile(file,JSON.stringify(config,null,2)+'\n');console.log('D1 binding configured.');
