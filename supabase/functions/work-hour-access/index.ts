const url=Deno.env.get('SUPABASE_URL')!;
const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cors={'Access-Control-Allow-Origin':'https://sayedsumon2025new.github.io','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const tables=['work_hour_approval_state','work_hour_department_sections','work_hour_ot_cost','work_hour_daily_punch','work_hour_user_interface'];
const tabs=['p1','p2','p3','p4','p5','p6','p7'];
const fail=(message:string,status=400)=>{throw Object.assign(new Error(message),{status})};
async function rest(path:string,method='GET',body?:unknown,prefer='return=representation'){
 const r=await fetch(url+'/rest/v1/'+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:prefer},body:body===undefined?undefined:JSON.stringify(body)});
 const d=await r.json().catch(()=>null);if(!r.ok)fail(d?.message||'Database request failed',r.status);return d;
}
async function auth(path:string,method:string,body?:unknown,token=key){
 const r=await fetch(url+'/auth/v1/'+path,{method,headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const d=await r.json().catch(()=>null);if(!r.ok)fail(d?.msg||d?.message||'Authentication failed',r.status);return d;
}
function cleanProfile(b:any){
 const r:any={};for(const k of ['email','user_name','department','section','designation','office_id'])r[k]=String(b[k]??'').trim();r.email=r.email.toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email))fail('Valid email required');
 for(const k of ['user_name','department','designation','office_id'])if(!r[k]||r[k].length>200)fail(k+' is required (max 200 characters)');
 if(r.section.length>200)fail('Section too long');return r;
}
function cleanPermissions(b:any){
 const r:any={};for(const tab of tabs){r[tab]={};for(const action of ['view','edit','delete','export'])r[tab][action]=b?.[tab]?.view===true&&b?.[tab]?.[action]===true;}return r;
}
export function entryScope(profile:any){
 return profile.is_admin||profile.permissions?.p7?.entry_scope==null?{mode:'all',rules:[]}:profile.permissions.p7.entry_scope;
}
export function entryAllowed(profile:any,row:any){
 const scope=entryScope(profile);return scope.mode==='all'||scope.rules?.some((r:any)=>
  String(row.department??'').trim()===r.department&&(r.section==='*'||String(row.section??'').trim()===r.section)&&(r.level==='*'||String(row.level??'').trim()===r.level));
}
export function scopeQuery(profile:any,q:URLSearchParams){
 const scope=entryScope(profile);if(scope.mode==='all')return;
 if(!scope.rules?.length){q.set('id','eq.00000000-0000-0000-0000-000000000000');return;}
 const quote=(v:string)=>'"'+v.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
 q.set('or','('+scope.rules.map((r:any)=>'and('+['department','section','level'].filter(k=>r[k]!=='*').map(k=>k+'.eq.'+quote(r[k])).join(',')+')').join(',')+')');
}
async function cleanEntryScope(value:any){
 if(value?.mode==='all')return {mode:'all',rules:[]};
 if(!Array.isArray(value?.rules))return {mode:'selected',rules:[]};
 if(value.rules.length>50)fail('At most 50 entry scope rules');
 const setups=await rest('work_hour_department_sections?select=department,section&limit=10000');
 const state=(await rest('work_hour_approval_state?id=eq.main&select=rows'))?.[0];
 const levels=new Set((state?.rows||[]).filter((r:any)=>r.k==='L').map((r:any)=>r.lv));
 const rules:any[]=[];
 for(const input of value.rules){
  const r={department:String(input.department||'').trim(),section:String(input.section??'*').trim(),level:String(input.level??'*').trim()};
  if(!setups.some((x:any)=>x.department===r.department&&(r.section==='*'||x.section===r.section)))fail('Choose a valid Department and Section for entry access');
  if(r.level!==''&&r.level!=='*'&&!levels.has(r.level))fail('Choose a configured Level for entry access');
  if(!rules.some(x=>JSON.stringify(x)===JSON.stringify(r)))rules.push(r);
 }
 return {mode:'selected',rules};
}
export function can(profile:any,tab:string,action='view'){return profile.active===true&&(profile.is_admin===true||profile.permissions?.[tab]?.[action]===true)}
// p2 dependencies expose only report quantities, never employee identities or salaries.
export function eotDependency(p:any,b:any,q:URLSearchParams){
 if((b.method||'GET')!=='GET'||b.context!=='p2'||!can(p,'p2'))return false;
 const projection=q.get('select'),dated=/^eq\.\d{4}-\d{2}-\d{2}$/.test(q.get('work_date')||'');
 const dates=projection==='work_date'&&(!q.has('work_date')||/^lt\.\d{4}-\d{2}-\d{2}$/.test(q.get('work_date')||''));
 return b.table==='work_hour_user_interface'&&(dates||dated&&['work_date,department,present_manpower,asking_hour,ot_5_pm,ot_6_pm,ot_7_pm,ot_8_pm,ot_9_pm,ot_10_pm','work_date,department,present_manpower,asking_hour,ot_5_pm,ot_6_pm,ot_7_pm,ot_8_pm,ot_9_pm,ot_10_pm,ot_11_pm,ot_12_am,ot_1_am'].includes(projection||''))||b.table==='work_hour_ot_cost'&&(dates||dated&&projection==='work_date,department,total_ot_hour');
}
export function authorizeData(p:any,b:any){
 const {table,method='GET'}=b;if(!tables.includes(table)||!['GET','POST','PATCH','DELETE'].includes(method))fail('Unsupported request');
 const q=new URLSearchParams(b.query||'');
 for(const k of q.keys())if(!['select','order','limit','offset','id','updated_at','work_date','on_conflict'].includes(k))fail('Unsupported filter');
 if(q.get('select')?.match(/[():!]/))fail('Embedded queries are not allowed');
 const anyView=tabs.some(t=>can(p,t));let allowed=false;
 if(method==='GET'){
  if(table==='work_hour_department_sections')allowed=anyView;
  if(table==='work_hour_approval_state')allowed=anyView;
  if(table==='work_hour_user_interface')allowed=can(p,'p1')||can(p,'p7')||eotDependency(p,b,q);
  if(table==='work_hour_ot_cost')allowed=can(p,'p4')||eotDependency(p,b,q);
  if(table==='work_hour_daily_punch'){
   allowed=can(p,'p5');
   if(!allowed&&can(p,'p7')){
    allowed=/^eq\.\d{4}-\d{2}-\d{2}$/.test(q.get('work_date')||'')&&q.get('select')==='work_date,employee_id,department,section,line';
   }
  }
 }else{
  const tab=({work_hour_approval_state:'p6',work_hour_department_sections:'p3',work_hour_user_interface:'p7',work_hour_ot_cost:'p4',work_hour_daily_punch:'p5'} as any)[table];
  allowed=can(p,tab,method==='DELETE'?'delete':'edit');
  if(table==='work_hour_approval_state'&&method!=='PATCH')allowed=false;
  if(['PATCH','DELETE'].includes(method)&&!q.get('id')?.startsWith('eq.'))fail('A single row ID is required');
 }
 if(!allowed)fail('Access denied for this tab or action',403);
 // Limit each page, while allowing existing paginated report loaders.
 const limit=Math.min(10000,Math.max(1,Number(q.get('limit')||1000)));q.set('limit',String(limit));return q;
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 try{
  if(req.method!=='POST')fail('POST required',405);
  const b=await req.json();
  if(b.op==='setup'){
   const profile=cleanProfile(b);if(String(b.password||'').length<10)fail('Use a password of at least 10 characters');
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(b.token||''))))).map(x=>x.toString(16).padStart(2,'0')).join('');
   const claimed=await rest('work_hour_setup?id=eq.true&token_hash=eq.'+digest+'&claimed_at=is.null&expires_at=gt.'+encodeURIComponent(new Date().toISOString()),'PATCH',{claimed_at:new Date().toISOString()});
   if(!claimed?.length)fail('Setup link invalid, expired or already used',403);
   let user:any;
   try{
    user=await auth('admin/users','POST',{email:profile.email,password:b.password,email_confirm:true});
    const row=await rest('work_hour_accounts','POST',{...profile,id:user.id,is_admin:true,permissions:{}});return new Response(JSON.stringify(row[0]),{headers:cors});
   }catch(e){if(user?.id)await auth('admin/users/'+user.id,'DELETE').catch(()=>{});await rest('work_hour_setup?id=eq.true&token_hash=eq.'+digest,'PATCH',{claimed_at:null});throw e;}
  }
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');if(!token)fail('Please log in',401);
  const user=await auth('user','GET',undefined,token);
  const rows=await rest('work_hour_accounts?id=eq.'+encodeURIComponent(user.id));const profile=rows?.[0];
  if(!profile?.active)fail('This account is inactive or has no Work Hour access',403);
  if(b.op==='me')return new Response(JSON.stringify(profile),{headers:cors});
  if(b.op==='save-entries'){
   if(!can(profile,'p7','edit'))fail('User Interface edit access required',403);
   if(!Array.isArray(b.entries)||!b.entries.length||b.entries.length>200)fail('Send 1 to 200 entries');
   return new Response(JSON.stringify(await rest('rpc/work_hour_save_entries','POST',{actor_id:user.id,entries:b.entries})),{headers:cors});
  }
  if(b.op==='data'){
   const q=authorizeData(profile,b);let payload=b.body,existingEntry:any=null;
   if(b.table==='work_hour_user_interface'&&b.method!=='GET'){
    if(q.has('on_conflict')||b.prefer?.includes('merge-duplicates'))fail('Entry upserts are not allowed');
    if(b.method==='PATCH'||b.method==='DELETE'){
     existingEntry=(await rest('work_hour_user_interface?id='+encodeURIComponent(q.get('id')||'')+'&select=department,section,level'))?.[0];
     if(!existingEntry||!entryAllowed(profile,existingEntry))fail('This existing row is outside your data-entry scope',403);
    }
   }
   if(b.table==='work_hour_user_interface'&&(b.method||'GET')==='GET'&&!eotDependency(profile,b,q)&&(b.context==='p7'||!can(profile,'p1'))){
    if(!can(profile,'p7'))fail('User Interface access required',403);scopeQuery(profile,q);
   }
   if(payload&&b.method!=='GET'){
    const stamp=(row:any)=>({...row,updated_by:profile.user_name});
    if(b.table==='work_hour_user_interface'){
     if(!entryAllowed(profile,{...existingEntry,...payload}))fail('Department, Section or Level is outside your data-entry scope',403);
     const hours=['ot_5_pm','ot_6_pm','ot_7_pm','ot_8_pm','ot_9_pm','ot_10_pm','ot_11_pm','ot_12_am','ot_1_am'];
     payload=stamp(payload);delete payload.iron_man;payload.ot_5_pm=payload.asking_manpower;
     for(const h of [...hours,'asking_manpower','present_manpower','staff','asking_hour'])if(payload[h]!=null&&(!Number.isFinite(Number(payload[h]))||Number(payload[h])<0||(h!=='asking_hour'&&!Number.isInteger(Number(payload[h])))))fail('Invalid quantity');
     for(let i=1;i<hours.length;i++)if(Number(payload[hours[i]]||0)>Number(payload[hours[i-1]]||0))fail('Hourly manpower cannot exceed the previous hour');
     const totalFields=[...hours.slice(1),'staff'];
     payload.total_manpower=totalFields.some(k=>payload[k]!=null)?totalFields.reduce((n,k)=>n+Number(payload[k]||0),0):null;
    }else if(b.table==='work_hour_approval_state'){
     if(!Array.isArray(payload.rows)||payload.rows.some((r:any)=>r.k!=='L'||!Array.isArray(r.v)))fail('Only line and level mappings can be saved');
     const previous=(await rest('work_hour_approval_state?id=eq.main&select=rows'))?.[0];
     if(payload.rows.length<(previous?.rows?.length||0)&&!can(profile,'p6','delete'))fail('Delete permission required',403);payload=stamp(payload);
    }else if(['work_hour_ot_cost','work_hour_daily_punch'].includes(b.table))payload=(Array.isArray(payload)?payload:[payload]).map((r:any)=>({...r,uploaded_by:profile.user_name}));
   }
   const prefer=b.prefer==='resolution=merge-duplicates,return=representation'?b.prefer:'return=representation';
   return new Response(JSON.stringify(await rest(b.table+'?'+q.toString(),b.method||'GET',payload,prefer)),{headers:cors});
  }
  if(!profile.is_admin)fail('Administrator access required',403);
  if(b.op==='users')return new Response(JSON.stringify(await rest('work_hour_accounts?order=created_at.asc')),{headers:cors});
  if(b.op==='save-user'){
   const data=cleanProfile(b);const permissions=cleanPermissions(b.permissions);
   const existingScope=b.id?(await rest('work_hour_accounts?id=eq.'+encodeURIComponent(b.id)+'&select=permissions'))?.[0]?.permissions?.p7?.entry_scope:null;
   permissions.p7.entry_scope=b.entry_scope===undefined?(existingScope||{mode:'all',rules:[]}):await cleanEntryScope(b.entry_scope);
   if(permissions.p7.edit&&permissions.p7.entry_scope.mode==='selected'&&!permissions.p7.entry_scope.rules.length)fail('Assign at least one entry scope or select all departments');
   if(b.id===profile.id)fail('Use another administrator to change your account');
   const previous=b.id?(await rest('work_hour_accounts?id=eq.'+encodeURIComponent(b.id)))?.[0]:null;
   if(b.id&&!previous)fail('Account not found',404);
   if(previous?.is_admin)fail('Administrator accounts cannot be changed here');
   const record={...data,active:b.active!==false,permissions,updated_at:new Date().toISOString()};let created:any;
   if(b.password&&String(b.password).length<10)fail('Use a password of at least 10 characters');
   if(!b.id&&!b.password)fail('Password required for new user');
   try{
    if(!b.id)created=await auth('admin/users','POST',{email:data.email,password:b.password,email_confirm:true});
    
    const out=await rest('work_hour_accounts'+(b.id?'?id=eq.'+encodeURIComponent(b.id):''),b.id?'PATCH':'POST',{...record,...(!b.id?{id:created.id}:{})});
    if(b.id&&(data.email!==previous.email||b.password)){
     try{await auth('admin/users/'+b.id,'PUT',{email:data.email,...(b.password?{password:b.password}:{}),email_confirm:true});}
     catch(e){await rest('work_hour_accounts?id=eq.'+encodeURIComponent(b.id),'PATCH',previous);throw e;}
    }
    return new Response(JSON.stringify(out[0]),{headers:cors});
   }catch(e){if(created?.id)await auth('admin/users/'+created.id,'DELETE').catch(()=>{});throw e;}
  }
  fail('Unknown action');
 }catch(e:any){return new Response(JSON.stringify({error:e.message||'Request failed'}),{status:e.status||400,headers:cors});}
});
