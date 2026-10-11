import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import spec from '../cloudflare/schema-spec.json' with {type:'json'};
import {hashPassword,digest} from '../cloudflare/crypto.mjs';
import {entryIdentity} from '../cloudflare/store.mjs';

const folder=resolve(process.argv[2]||'');
if(!process.argv[2])throw Error('Usage: node scripts/prepare-d1-import.mjs /absolute/private-export-directory');
const sqlPath=join(folder,'d1-import.sql'),manifest={},statements=[];
const literal=v=>v==null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const quote=v=>'"'+v+'"';
const sha=value=>createHash('sha256').update(value).digest('hex');
function insert(table,row){
 const keys=Object.keys(row),values=keys.map(k=>{const v=row[k];return v==null?null:typeof v==='boolean'?Number(v):typeof v==='object'?JSON.stringify(v):v;});
 return 'INSERT INTO '+quote(table)+' ('+keys.map(quote).join(',')+') VALUES ('+values.map(literal).join(',')+');';
}
const files=await readdir(folder);
const required=Object.keys(spec).map(t=>'public.'+t+'.json');
const published=Object.keys(spec).filter(t=>!['users','module_access','work_hour_accounts'].includes(t));
required.push(...published.map(t=>'datacell_publication_private.'+t+'.json'),'publication.head.json','auth.credentials.json','work_hour_private.entry_archive.json');
for(const name of required)if(!files.includes(name))throw Error('Incomplete export: missing '+name);
const head=JSON.parse(await readFile(join(folder,'publication.head.json'),'utf8'));
for(const name of required.filter(n=>n.startsWith('public.')||n.startsWith('datacell_publication_private.'))){
 const original=await readFile(join(folder,name),'utf8'),rows=JSON.parse(original),snapshot=name.startsWith('datacell_publication_private.');
 const table=name.slice(snapshot?'datacell_publication_private.'.length:'public.'.length,-5);
 if(!Array.isArray(rows))throw Error('Invalid export: '+name);
 const seen=new Set();
 for(const row of rows){
  const key=JSON.stringify(spec[table].primary.map(k=>row[k]));if(seen.has(key))throw Error('Duplicate exported key in '+name);seen.add(key);
  if(snapshot&&row._publication_version!==head.version)throw Error('Published snapshot version mismatch');
  if(table==='users'&&!snapshot&&!row.password.startsWith('pbkdf2$'))row.password=await hashPassword(row.password);
  if(table==='work_hour_user_interface'&&!snapshot)row._identity=entryIdentity(row);
  statements.push(insert(snapshot?'published_'+table:table,row));
 }
 // Destroy the exported plaintext DataCell passwords after converting them.
 if(table==='users'&&!snapshot)await writeFile(join(folder,name),JSON.stringify(rows),{mode:0o600});
 const canonical=JSON.stringify(rows);manifest[(snapshot?'published_':'')+table]={rows:rows.length,sha256:sha(canonical)};
}
for(const row of JSON.parse(await readFile(join(folder,'auth.credentials.json'),'utf8'))){
 if(!/^\$2[aby]\$/.test(row.encrypted_password))throw Error('Unsupported Work Hour password hash');
 statements.push(insert('auth_credentials',{id:row.id,password_hash:row.encrypted_password,credential_version:await digest(row.encrypted_password)}));
}
const archives=JSON.parse(await readFile(join(folder,'work_hour_private.entry_archive.json'),'utf8'));
for(const row of archives)statements.push(insert('entry_archive',{id:String(row.archive_id),original_id:row.original_id,row_data:typeof row.row_data==='string'?row.row_data:JSON.stringify(row.row_data),reason:row.reason,actor_id:row.actor_id,archived_at:row.archived_at}));
statements.push(insert('publication_versions',{version:head.version,published_at:head.published_at,published_by:head.published_by}));
statements.push(insert('publication_head',{id:1,version:head.version,published_at:head.published_at,published_by:head.published_by}));
for(const [name,item]of Object.entries(manifest))statements.push(insert('migration_manifest',{name,row_count:item.rows,sha256:item.sha256}));
const dataSQL=statements.join('\n')+'\n';
// Verify the full migration against real SQLite before writing an import artifact.
const db=new DatabaseSync(':memory:');
db.exec(await readFile(new URL('../cloudflare/migrations/0001_initial.sql',import.meta.url),'utf8'));
db.exec('BEGIN');try{db.exec(dataSQL);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
for(const [name,item]of Object.entries(manifest))if(db.prepare('SELECT count(*) AS n FROM '+quote(name)).get().n!==item.rows)throw Error('Import count mismatch: '+name);
db.close();
await writeFile(sqlPath,dataSQL,{mode:0o600});
await writeFile(join(folder,'manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),publication:head,sqlSha256:sha(dataSQL),tables:manifest},null,2),{mode:0o600});
console.log('D1 import verified: '+Object.values(manifest).reduce((n,x)=>n+x.rows,0)+' source/snapshot rows; '+archives.length+' archived entries.');
console.log('Private artifacts: d1-import.sql and manifest.json in the specified export directory.');
