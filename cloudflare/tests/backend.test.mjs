import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {Store,entryIdentity} from '../store.mjs';
import {Service,entryTimeAllowed} from '../service.mjs';
import {hashPassword,digest,randomToken,verifyPassword} from '../crypto.mjs';
import worker from '../worker.mjs';
import bcrypt from '../vendor/bcrypt.mjs';

class D1 {
  constructor(){this.sql=new DatabaseSync(':memory:');this.sql.exec(readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));}
  prepare(sql){
    const db=this.sql;
    return {values:[],bind(...values){this.values=values;return this;},
      async all(){return {results:db.prepare(sql).all(...this.values)};},
      async first(){return db.prepare(sql).get(...this.values)||null;},
      async run(){const result=db.prepare(sql).run(...this.values);return {results:[],meta:{changes:Number(result.changes)}};},
      execute(){const stmt=db.prepare(sql);return stmt.columns().length?{results:stmt.all(...this.values)}:{results:[],meta:stmt.run(...this.values)};}};
  }
  async batch(statements){this.sql.exec('BEGIN');try{const results=statements.map(s=>s.execute());this.sql.exec('COMMIT');return results;}catch(e){this.sql.exec('ROLLBACK');throw e;}}
}
const url='https://datacell-task-management.sayedsumon2025new.workers.dev';
async function fixture(){
 const DB=new D1(),env={DB,AUTH_SECRET:randomToken(),ASSETS:{fetch:()=>new Response('asset')}};
 const service=new Service(env,new Request(url));
 const password=await hashPassword('test-password-123');
 for(const name of ['admin','Alice','Bob'])await service.rest('users','POST',{name,password,color:'#abc'});
 await service.rest('module_access','POST',{username:'Alice',modules:'personal'});
 await service.rest('tasks','POST',[{sl:1,task:'Alice task',person:'Alice'},{sl:2,task:'Bob task',person:'Bob'}]);
 await service.rest('work_hour_accounts','POST',{id:'11111111-1111-4111-8111-111111111111',email:'admin@example.test',user_name:'WH Admin',department:'IT',section:'',designation:'Admin',office_id:'A1',active:true,is_admin:true,permissions:{}});
 await service.rest('work_hour_accounts','POST',{id:'22222222-2222-4222-8222-222222222222',email:'entry@example.test',user_name:'Entry User',department:'Finishing',section:'Iron',designation:'Operator',office_id:'A2',active:true,is_admin:false,permissions:{p7:{view:true,edit:true,delete:true,entry_scope:{mode:'selected',rules:[{department:'Finishing',section:'Iron',level:'*'}]}}}});
 for(const account of await service.read('work_hour_accounts'))await DB.prepare('INSERT INTO auth_credentials(id,password_hash,credential_version) VALUES(?,?,?)').bind(account.id,password,await digest(password)).run();
 const adminToken=randomToken();await service.loginDatacell({p_username:'admin',p_password:'test-password-123',p_token_hash:await digest(adminToken)});
 await service.publish({p_actor_kind:'datacell',p_actor_id:await digest(adminToken),p_expected_version:null});
 return {DB,env,service,adminToken};
}
async function post(env,path,body,token,origin=url){
 const req=new Request(url+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
 const r=await worker.fetch(req,env);return {status:r.status,headers:r.headers,data:await r.json()};
}
test('password hashes and name list never expose credentials',async()=>{
 const {env,service}=await fixture();
 const names=await post(env,'/functions/v1/datacell-access',{op:'names'});
 assert.equal(names.status,200);assert.equal(names.headers.get('Access-Control-Allow-Origin'),url);
 assert.ok(names.data.every(r=>Object.keys(r).sort().join(',')==='color,name'));
 const user=await service.first('users','name=eq.Alice',true);
 assert.ok(user.password.startsWith('pbkdf2$'));assert.equal(await verifyPassword('wrong',user.password),false);
 assert.equal(await verifyPassword('test-password-123',user.password),true);
});
test('login, server-side authorization, logout and password revocation',async()=>{
 const {env,service,adminToken}=await fixture();
 const login=await post(env,'/functions/v1/datacell-access',{op:'login',name:'Alice',password:'test-password-123'});
 assert.equal(login.status,200);assert.ok(login.data.token);assert.ok(login.data.cacheSecret);
 const own=await post(env,'/functions/v1/datacell-access',{op:'data',table:'tasks',method:'PATCH',query:'sl=eq.1',body:{actual_date:'2026-10-11'}},login.data.token);
 assert.equal(own.status,200);
 const other=await post(env,'/functions/v1/datacell-access',{op:'data',table:'tasks',method:'PATCH',query:'sl=eq.2',body:{actual_date:'2026-10-11'}},login.data.token);
 assert.equal(other.status,403);assert.equal((await service.first('tasks','sl=eq.2')).actual_date,'');
 const denied=await post(env,'/functions/v1/datacell-access',{op:'data',table:'users',method:'GET'});
 assert.equal(denied.status,401);
 const settings=await post(env,'/functions/v1/datacell-access',{op:'data',table:'users',method:'GET'},adminToken);
 assert.ok(settings.data.every(r=>r.password===''));
 await service.replaceUsers({p_token_hash:await digest(adminToken),p_rows:[{name:'admin',password:''},{name:'Alice',password:'new-password-123'},{name:'Bob',password:''}]});
 assert.equal((await post(env,'/functions/v1/datacell-access',{op:'head'},login.data.token)).status,401);
 assert.equal((await post(env,'/functions/v1/datacell-access',{op:'logout'},adminToken)).status,200);
 assert.equal((await post(env,'/functions/v1/datacell-access',{op:'head'},adminToken)).status,401);
});
test('published reports do not change until publish; stale publish rolls back',async()=>{
 const {service,adminToken}=await fixture();const head=await service.publicationHead();
 await service.rest('tasks?sl=eq.1','PATCH',{task:'Draft edit'});
 assert.equal((await service.rpc('datacell_read_published',{p_source:'tasks',p_query:{sl:'eq.1'},p_version:head.version}))[0].task,'Alice task');
 const next=await service.publish({p_actor_kind:'datacell',p_actor_id:await digest(adminToken),p_expected_version:head.version});
 assert.equal((await service.read('tasks','sl=eq.1',next.version))[0].task,'Draft edit');
 await assert.rejects(service.publish({p_actor_kind:'datacell',p_actor_id:await digest(adminToken),p_expected_version:head.version}),e=>e.status===409);
 assert.equal((await service.publicationHead()).version,next.version);
 assert.equal((await service.db.prepare('SELECT count(*) AS n FROM publication_versions').first()).n,2);
});
test('work-hour authentication, refresh rotation and logout use D1',async()=>{
 const {env}=await fixture();
 const login=await post(env,'/auth/v1/token?grant_type=password',{email:'admin@example.test',password:'test-password-123'});
 assert.equal(login.status,200);
 const me=await post(env,'/functions/v1/work-hour-access',{op:'me'},login.data.access_token);
 assert.equal(me.status,200);assert.equal(me.data.is_admin,true);assert.ok(me.data.server_now);
 const refreshed=await post(env,'/auth/v1/token?grant_type=refresh_token',{refresh_token:login.data.refresh_token});assert.equal(refreshed.status,200);
 assert.equal((await post(env,'/auth/v1/token?grant_type=refresh_token',{refresh_token:login.data.refresh_token})).status,401);
 assert.equal((await post(env,'/auth/v1/logout',{},refreshed.data.access_token)).status,200);
 assert.equal((await post(env,'/functions/v1/work-hour-access',{op:'me'},refreshed.data.access_token)).status,401);
});
test('work-hour entry scope, cutoff, quantities, normalized duplicates and atomic revisions',async()=>{
 const {service}=await fixture();const admin='11111111-1111-4111-8111-111111111111',id=crypto.randomUUID();
 const row={id,work_date:'2026-10-11',department:'Finishing',section:'Iron',level:'Level 01',line_no:'Line 001',asking_manpower:10,ot_6_pm:8,staff:2};
 const saved=await service.saveEntries(admin,[{row,expected_updated_at:null}]);assert.equal(saved.rows[0].total_manpower,10);
 await assert.rejects(service.saveEntries(admin,[{row:{...row,id:crypto.randomUUID(),level:'level-1',line_no:'1'},expected_updated_at:null}]),e=>e.status===409);
 await assert.rejects(service.saveEntries(admin,[{row:{...row,ot_6_pm:11},expected_updated_at:saved.rows[0].updated_at}]),/Hourly manpower/);
 await assert.rejects(service.saveEntries(admin,[{row:{...row,department:'Changed'},expected_updated_at:'old'}]),e=>e.status===409);
 const good=crypto.randomUUID(),bad=crypto.randomUUID();
 await assert.rejects(service.saveEntries(admin,[{row:{...row,id:good,line_no:'2'},expected_updated_at:null},{row:{...row,id:bad,line_no:'3',asking_manpower:-1},expected_updated_at:null}]));
 assert.equal(await service.first('work_hour_user_interface','id=eq.'+good),undefined);
 assert.equal(entryTimeAllowed(false,'2026-10-11',Date.parse('2026-10-11T10:59:59Z')),true);
 assert.equal(entryTimeAllowed(false,'2026-10-11',Date.parse('2026-10-11T11:00:00Z')),false);
 assert.equal(entryTimeAllowed(false,'2026-10-10',Date.parse('2026-10-11T10:00:00Z')),false);
 assert.equal(entryIdentity(row),entryIdentity({...row,level:'level-1',line_no:'1'}));
});
test('scoped entry reads are filtered before pagination, forbidden tables and origins blocked',async()=>{
 const {env,service}=await fixture();
 await service.saveEntries('11111111-1111-4111-8111-111111111111',[{row:{id:crypto.randomUUID(),work_date:'2026-10-11',department:'Finishing',section:'Iron'},expected_updated_at:null},{row:{id:crypto.randomUUID(),work_date:'2026-10-11',department:'Other',section:'Other'},expected_updated_at:null}]);
 const login=await post(env,'/auth/v1/token?grant_type=password',{email:'entry@example.test',password:'test-password-123'});
 const data=await post(env,'/functions/v1/work-hour-access',{op:'data',table:'work_hour_user_interface',method:'GET',query:'select=*&limit=1',context:'p7'},login.data.access_token);
 assert.equal(data.status,200);assert.equal(data.data.length,1);assert.equal(data.data[0].department,'Finishing');
 assert.equal((await post(env,'/functions/v1/work-hour-access',{op:'data',table:'work_hour_ot_cost',method:'GET'},login.data.access_token)).status,403);
 assert.equal((await post(env,'/functions/v1/datacell-access',{op:'names'},undefined,'https://evil.example')).status,403);
 assert.equal((await post(env,'/rest/v1/users',{})).status,404);
 await assert.rejects(service.read('tasks','sl=eq.1;DROP TABLE users'));
 assert.equal((await service.read('users')).length,3);
});
test('failed D1 revision guard rolls back every statement in its batch',async()=>{
 const {service}=await fixture();
 await assert.rejects(service.batch([service.insertStatement('tasks',{sl:99,task:'must roll back'}),service.guard('0')]),e=>e.status===409);
 assert.equal(await service.first('tasks','sl=eq.99'),undefined);
});
test('legacy Work Hour bcrypt passwords are upgraded on first login',async()=>{
 const {service}=await fixture();const id='11111111-1111-4111-8111-111111111111';
 const legacy=await bcrypt.hash('legacy-password-123',4);
 await service.db.prepare('UPDATE auth_credentials SET password_hash=?,credential_version=? WHERE id=?').bind(legacy,await digest(legacy),id).run();
 const session=await service.workLogin('password',{email:'admin@example.test',password:'legacy-password-123'});
 assert.ok(session.access_token);
 assert.ok((await service.db.prepare('SELECT password_hash FROM auth_credentials WHERE id=?').bind(id).first()).password_hash.startsWith('pbkdf2$'));
});
test('failed login throttles after ten attempts; inactive accounts cannot use existing sessions',async()=>{
 const {service,env}=await fixture();
 for(let i=0;i<10;i++)await assert.rejects(service.loginDatacell({p_username:'unknown',p_password:'bad',p_token_hash:await digest(randomToken())}),e=>e.status===401);
 await assert.rejects(service.loginDatacell({p_username:'unknown',p_password:'bad',p_token_hash:await digest(randomToken())}),e=>e.status===429);
 const login=await service.workLogin('password',{email:'entry@example.test',password:'test-password-123'});
 await service.rest('work_hour_accounts?id=eq.22222222-2222-4222-8222-222222222222','PATCH',{active:false});
 assert.equal((await post(env,'/functions/v1/work-hour-access',{op:'me'},login.access_token)).status,403);
});
