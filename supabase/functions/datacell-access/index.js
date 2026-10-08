// Deployment proposal. Custom memory-only sessions preserve existing usernames/passwords.
const base=Deno.env.get('SUPABASE_URL'),secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const cors={'Access-Control-Allow-Origin':'https://sayedsumon2025new.github.io','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const sources=['tasks','done_state','meta','app_state','task_completions','task_remarks','working_hours_defaults','working_hours_daily','multi_skill_assignments','user_roles','leave_applications','leave_report_coverage'];
const metadata=['users','module_access'];
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
async function rest(path,method='GET',body,prefer='return=representation'){
 const r=await fetch(base+'/rest/v1/'+path,{method,headers:{apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json',Prefer:prefer},body:body===undefined?undefined:JSON.stringify(body)});
 const d=await r.json().catch(()=>null);if(!r.ok)fail(d?.message||'Database request failed',r.status);return d;
}
const rpc=(name,body={})=>rest('rpc/'+name,'POST',body);
async function digest(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('')}
function token(){return [...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function cacheSecret(profile){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify(['datacell-report-cache',profile.name,profile.modules,profile.credentialVersion]))))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function queryFor(input){
 const q=new URLSearchParams(input||'');
 if([...q.values()].some(x=>x.length>20000)||[...q.keys()].some(x=>!/^[a-z_]+$/.test(x)))fail('Unsupported query');
 if(q.get('select')?.match(/[():!]/))fail('Embedded queries are not allowed');
 return q;
}
function ownTask(profile,row){return row?.person===profile.name||row?.person==='Sayed/Johir'&&['Sayed','Johir'].includes(profile.name)}
async function taskFor(sl){return (await rest('tasks?sl=eq.'+encodeURIComponent(sl)+'&select=sl,person'))?.[0]}
async function authorizeWrite(profile,b,q){
 if(profile.is_admin)return;
 if(metadata.includes(b.table)||['multi_skill_assignments','user_roles'].includes(b.table))fail('Administrator access required',403);
 const rows=Array.isArray(b.body)?b.body:[b.body];
 if(b.table==='tasks'){
  const sl=q.get('sl')?.match(/^eq\.(\d+)$/)?.[1];
  if(b.method!=='PATCH'||!sl||!b.body||Array.isArray(b.body))fail('Only one assigned task can be updated',403);
  const assigned=ownTask(profile,await taskFor(sl)),modules=profile.modules.split(',');
  const keys=Object.keys(b.body);
  if(keys.some(k=>!['actual_date','actual_time','lead_time','plan_time'].includes(k))||(!assigned&&!(modules.includes('plantime')&&keys.every(k=>k==='plan_time'))))fail('Task edit access denied',403);
 }else if(b.table==='done_state'){
  if(rows.some(r=>r?.username!==profile.name))fail('Status belongs to another account',403);
 }else if(b.table==='working_hours_defaults'||b.table==='working_hours_daily'){
  if(!profile.modules.split(',').includes('workinghours')&&rows.some(r=>r?.person!==profile.name))fail('Working hours access denied',403);
 }else if(b.table==='task_remarks'||b.table==='task_completions'){
  for(const row of rows)if(!row||!ownTask(profile,await taskFor(row.task_sl)))fail('Task access denied',403);
 }else if(b.table==='leave_applications'||b.table==='leave_report_coverage'){
  // Existing role-based workflow: approvals require the live role marker.
  const reviewer=profile.modules.includes('__role__:Supervisor')||profile.modules.includes('__role__:Section Incharge');
  if(b.table==='leave_applications'&&!reviewer&&rows.some(r=>r?.employee!==profile.name))fail('Leave application belongs to another account',403);
  if(b.table==='leave_report_coverage'&&!reviewer){
   const ids=b.method==='DELETE'?[q.get('application_id')?.replace(/^eq\./,'')]:rows.map(r=>r?.application_id);
   for(const id of ids){
    if(!id)fail('Leave application required',403);
    const application=(await rest('leave_applications?id=eq.'+encodeURIComponent(id)+'&select=employee'))?.[0];
    if(application?.employee!==profile.name)fail('Leave application belongs to another account',403);
   }
  }
 }else if(b.table==='app_state'){
  if(rows.some(r=>r?.key!=='version'))fail('Administrator access required',403);
 }else if(b.table==='meta'){
  if(rows.some(r=>r?.key!=='version'&&!/^taskRemark:|^taskCompletion:|^leaveApplication:/.test(r?.key||'')))fail('Administrator access required',403);
 }else fail('Write access denied',403);
}
async function published(profile,b,q){
 const head=await rpc('datacell_publication_head');
 if(!head)fail('Admin must publish the first report',409);
 const version=b.version||head.version;
 if(!/^[a-f0-9-]{36}$/.test(version))fail('Invalid report version');
 const cacheKey=await digest(JSON.stringify([profile.name,profile.modules,version,b.table,q.toString()]));
 if(b.knownVersion===cacheKey)return {unchanged:true,cacheKey,version};
 const data=await rpc('datacell_read_published',{p_source:b.table,p_query:Object.fromEntries(q),p_version:version});
 return {unchanged:false,cacheKey,version,publishedAt:head.publishedAt,data};
}
export async function handle(req){
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 try{
  if(req.method!=='POST')fail('POST required',405);
  const b=await req.json();
  if(b.op==='names'){
   const data=await rest('users?select=name,color&order=name.asc');return new Response(JSON.stringify(data),{headers:cors});
  }
  if(b.op==='login'){
   if(typeof b.name!=='string'||b.name.length>200||typeof b.password!=='string'||b.password.length>1000)fail('Name and password required');
   const sessionToken=token(),hash=await digest(sessionToken);
   const result=await rpc('datacell_login',{p_username:b.name,p_password:b.password,p_token_hash:hash});
   if(result.error)fail(result.error,result.status);
   const profile=await rpc('datacell_session',{p_token_hash:hash});
   return new Response(JSON.stringify({...result,token:sessionToken,cacheSecret:await cacheSecret(profile)}),{headers:cors});
  }
  const raw=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');
  if(!/^[a-f0-9]{64}$/.test(raw))fail('Please log in',401);
  const hash=await digest(raw);
  let profile;try{profile=await rpc('datacell_session',{p_token_hash:hash})}catch(e){fail('Please log in',401)}
  if(b.op==='logout'){await rpc('datacell_logout',{p_token_hash:hash});return new Response('{}',{headers:cors})}
  if(b.op==='head')return new Response(JSON.stringify(await rpc('datacell_publication_head')),{headers:cors});
  if(b.op==='publish'){
   if(!profile.is_admin)fail('Administrator access required',403);
   const data=await rpc('datacell_publish',{p_actor_kind:'datacell',p_actor_id:hash,p_expected_version:b.expectedVersion??null});
   return new Response(JSON.stringify(data),{headers:cors});
  }
  if(b.op==='save-users'){
   if(!profile.is_admin)fail('Administrator access required',403);
   const data=await rpc('datacell_replace_users',{p_token_hash:hash,p_rows:b.rows});
   return new Response(JSON.stringify(data),{headers:cors});
  }
  if(b.op!=='data'||![...sources,...metadata].includes(b.table))fail('Unsupported request');
  const method=b.method||'GET',q=queryFor(b.query);
  if(!['GET','POST','PATCH','DELETE'].includes(method))fail('Unsupported method');
  if(method==='GET'){
   if(b.table==='users'){
    const data=await rest(profile.is_admin?'users?select=*':'users?select=name,color');return new Response(JSON.stringify(data),{headers:cors});
   }
   if(b.table==='module_access'){
    const data=await rest('module_access?select=*'+(profile.is_admin?'':'&username=eq.'+encodeURIComponent(profile.name)));return new Response(JSON.stringify(data),{headers:cors});
   }
   if(b.editor===true){
    // Live reads are for admin editors or the caller's own status merge only.
    if(!profile.is_admin&&!(b.table==='done_state'&&q.get('username')==='eq.'+profile.name))fail('Live editing access denied',403);
    const data=await rest(b.table+'?'+q.toString());return new Response(JSON.stringify(data),{headers:cors});
   }
   const data=await published(profile,b,q);return new Response(JSON.stringify(data),{headers:cors});
  }
  await authorizeWrite(profile,{...b,method},q);
  if(['PATCH','DELETE'].includes(method)&&![...q.keys()].some(k=>!['select','order','limit','offset'].includes(k)))fail('A write filter is required');
  const prefer=b.prefer==='resolution=merge-duplicates,return=representation'?b.prefer:'return=representation';
  const data=await rest(b.table+'?'+q.toString(),method,b.body,prefer);
  return new Response(JSON.stringify(data??[]),{headers:cors});
 }catch(e){return new Response(JSON.stringify({error:e.message||'Request failed'}),{status:e.status||400,headers:cors});}
}
if(import.meta.main)Deno.serve(handle);
