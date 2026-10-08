import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const db=new PGlite();
let whHandler;
globalThis.Deno={env:{get:k=>k==='SUPABASE_URL'?'https://fixture.supabase.co':'server-only-test-key'},serve:fn=>{whHandler=fn;}};
const qi=s=>'"'+s.replaceAll('"','""')+'"';
async function databaseFetch(url,options={}){
 const parsed=new URL(url),path=parsed.pathname.slice('/rest/v1/'.length);
 const body=options.body?JSON.parse(options.body):undefined;
 try{
  if(path.startsWith('rpc/')){
   const name=path.slice(4);assert(/^[a-z_]+$/.test(name));
   const entries=Object.entries(body||{});
   const sql='select public.'+qi(name)+'('+entries.map(([k],i)=>qi(k)+' => $'+(i+1)).join(',')+') result';
   const args=entries.map(([,v])=>v&&typeof v==='object'?JSON.stringify(v):v);
   const result=(await db.query(sql,args)).rows[0]?.result??null;
   return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
  }
  assert(/^[a-z_]+$/.test(path));
  const q=parsed.searchParams,values=[],filters=[];
  for(const [k,v] of q){
   if(['select','order','limit','offset','on_conflict'].includes(k))continue;
   assert(/^[a-z_]+$/.test(k));assert(v.startsWith('eq.'));
   values.push(v.slice(3));filters.push(qi(k)+'=$'+values.length);
  }
  const where=filters.length?' where '+filters.join(' and '):'';
  const method=options.method||'GET';
  let result;
  if(method==='GET'){
   const projection=q.get('select')||'*';assert(projection==='*'||/^[a-z_,]+$/.test(projection));
   result=await db.query('select '+(projection==='*'?'*':projection.split(',').map(qi).join(','))+' from public.'+qi(path)+where,values);
  }else if(method==='PATCH'){
   const fields=Object.keys(body),args=Object.values(body);
   const condition=filters.map(s=>s.replace(/\$(\d+)/g,(_,n)=>'$'+(Number(n)+args.length))).join(' and ');
   result=await db.query('update public.'+qi(path)+' set '+fields.map((k,i)=>qi(k)+'=$'+(i+1)).join(',')+(condition?' where '+condition:'')+' returning *',[...args,...values]);
  }else if(method==='POST'){
   const rows=Array.isArray(body)?body:[body];let returned=[];
   for(const row of rows){const keys=Object.keys(row);const r=await db.query('insert into public.'+qi(path)+' ('+keys.map(qi).join(',')+') values ('+keys.map((_,i)=>'$'+(i+1)).join(',')+') returning *',Object.values(row));returned.push(...r.rows);}
   result={rows:returned};
  }else throw new Error('Unsupported fixture request');
  return new Response(JSON.stringify(result.rows),{headers:{'Content-Type':'application/json'}});
 }catch(e){return new Response(JSON.stringify({message:e.message}),{status:400,headers:{'Content-Type':'application/json'}});}
}
let mainHandle;
globalThis.fetch=async(url,options={})=>{
 const parsed=new URL(url);
 if(parsed.pathname.startsWith('/rest/v1/'))return databaseFetch(url,options);
 if(parsed.pathname==='/auth/v1/user'){
  const bearer=new Headers(options.headers).get('Authorization');
  const id=bearer==='Bearer wh-admin'?'10000000-0000-0000-0000-000000000001':bearer==='Bearer wh-user'?'10000000-0000-0000-0000-000000000002':null;
  return new Response(JSON.stringify(id?{id}:{message:'Invalid token'}),{status:id?200:401});
 }
 if(parsed.pathname==='/functions/v1/datacell-access')return mainHandle(new Request(url,options));
 throw new Error('Unexpected network request');
};
try{
 await db.exec(`
 create role anon;create role authenticated;create role service_role bypassrls;
 create table public.users(id integer,name text unique,password text,color text);
 create table public.module_access(username text,modules text);
 create table public.tasks(sl integer primary key,task text,person text,actual_date text,actual_time text,plan_time text,lead_time text);
 create table public.work_hour_accounts(id uuid primary key,user_name text,active boolean,is_admin boolean,permissions jsonb);
 create table public.work_hour_user_interface(id uuid primary key,work_date date,department text,present_manpower integer);
 create table public.work_hour_ot_cost(id integer,work_date date,department text,total_ot_hour numeric);
 create table public.work_hour_daily_punch(id integer,work_date date,employee_id text,department text,section text,line text);
 create table public.work_hour_department_sections(id integer,department text,section text,sort_order integer);
 create table public.work_hour_approval_state(id text,report_date date,rows jsonb,updated_at timestamptz);
 insert into public.users values(1,'admin','admin-test-password','#fff'),(2,'user','user-test-password','#000');
 insert into public.module_access values('user','overview');
 insert into public.tasks values(1,'Old task','user','','','','');
 insert into public.work_hour_accounts values
 ('10000000-0000-0000-0000-000000000001','WH Admin',true,true,'{}'),
 ('10000000-0000-0000-0000-000000000002','WH User',true,false,'{"p1":{"view":true},"p2":{"view":true},"p7":{"view":true,"edit":true}}');
 insert into public.work_hour_user_interface values('20000000-0000-0000-0000-000000000001','2026-10-08','Sewing',20);
 grant all on all tables in schema public to service_role;
 `);
 await db.exec(await fs.readFile(new URL('../../database/admin_publication_schema.sql',import.meta.url),'utf8'));
 mainHandle=(await import('../../supabase/functions/datacell-access/index.js')).handle;
 await import('../../supabase/functions/work-hour-access/index.ts');
 const call=async(handle,body,token)=>{
  const r=await handle(new Request('https://fixture.supabase.co/functions/v1/test',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}));
  return {status:r.status,data:await r.json()};
 };
 const admin=(await call(mainHandle,{op:'login',name:'admin',password:'admin-test-password'})).data;
 const user=(await call(mainHandle,{op:'login',name:'user',password:'user-test-password'})).data;
 assert(admin.token);assert(user.token);
 assert.equal((await call(mainHandle,{op:'login',name:'user',password:'wrong'})).status,401);
 assert(!(await call(mainHandle,{op:'names'})).data.some(row=>'password'in row));
 assert(!(await call(mainHandle,{op:'data',table:'users'},user.token)).data.some(row=>'password'in row));
 assert.equal((await call(mainHandle,{op:'publish',expectedVersion:null,is_admin:true},user.token)).status,403);
 const first=(await call(mainHandle,{op:'publish',expectedVersion:null},admin.token)).data;
 assert(first.version);
 assert.equal((await call(whHandler,{op:'publish-reports',expectedVersion:first.version},'wh-user')).status,403);
 const read={op:'data',table:'tasks',query:'select=*',version:first.version};
 const before=await call(mainHandle,read,user.token);assert.equal(before.data.data[0].task,'Old task');
 const save=await call(mainHandle,{op:'data',table:'tasks',method:'PATCH',query:'sl=eq.1',body:{actual_date:'2026-10-08',actual_time:'12:00'}},user.token);
 assert.equal(save.status,200);assert.equal(save.data[0].actual_date,'2026-10-08');
 assert.equal((await call(mainHandle,read,user.token)).data.data[0].actual_date,'');
 assert.equal((await call(mainHandle,{...read,editor:true},user.token)).status,403);
 const second=(await call(whHandler,{op:'publish-reports',expectedVersion:first.version},'wh-admin')).data;
 assert(second.version);assert.equal((await call(mainHandle,{...read,version:second.version},user.token)).data.data[0].actual_date,'2026-10-08');
 await db.exec('update public.work_hour_user_interface set present_manpower=30');
 const whRead={op:'data',table:'work_hour_user_interface',query:'select=*&order=id.asc',version:second.version,publication:true};
 assert.equal((await call(whHandler,whRead,'wh-user')).data.data[0].present_manpower,20);
 const whEditor=await call(whHandler,{...whRead,context:'p7'},'wh-user');
 assert.equal(whEditor.status,200);assert.equal(whEditor.data[0].present_manpower,30,'entry editor uses current revision while reports stay published');
 const cached=await call(mainHandle,{...read,version:second.version},user.token);
 const noBytes=await call(mainHandle,{...read,version:second.version,knownVersion:cached.data.cacheKey},user.token);
 assert.equal(noBytes.data.unchanged,true);assert(!('data'in noBytes.data));
 await db.exec("update public.work_hour_accounts set active=false where id='10000000-0000-0000-0000-000000000002'");
 assert.equal((await call(whHandler,whRead,'wh-user')).status,403);
 assert.equal((await call(mainHandle,{op:'save-users',rows:[]},user.token)).status,403);
 const replace=await call(mainHandle,{op:'save-users',rows:[{name:'admin',password:'admin-test-password',color:'#fff'},{name:'user',password:'user-test-password',color:'#000'}]},admin.token);
 assert.equal(replace.status,200);
 assert.equal((await call(mainHandle,{op:'head'},admin.token)).status,200,'atomic user maintenance keeps admin authenticated');
 for(const file of ['index.html','work_hour_approval_dashboard.html','work_hour_login.html']){
  const html=await fs.readFile(new URL('../../'+file,import.meta.url),'utf8');
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
 }
 console.log('PASS: real PostgreSQL + both API handlers: existing login, no public credential response, forged-admin rejection, saved-but-unpublished data, both admins publishing one shared version, read-only reports versus live entry editor, cache authorization, deactivated user denial, atomic user settings and inline syntax.');
}finally{await db.close();}
