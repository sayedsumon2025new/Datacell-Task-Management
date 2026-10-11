import { Store, fail, norm, entryIdentity } from './store.mjs';
import { digest, hashPassword, verifyPassword, randomToken } from './crypto.mjs';
import spec from './schema-spec.json' with { type: 'json' };

export const sources = Object.keys(spec).filter(t => !['users', 'module_access', 'work_hour_accounts'].includes(t));
const hourKeys = ['ot_5_pm','ot_6_pm','ot_7_pm','ot_8_pm','ot_9_pm','ot_10_pm','ot_11_pm','ot_12_am','ot_1_am'];
const can = (p, tab, action='view') => p.active && (p.is_admin || p.permissions?.[tab]?.[action] === true);
const allowed = (p, row) => p.is_admin || !p.permissions?.p7?.entry_scope || p.permissions.p7.entry_scope.mode === 'all' || p.permissions.p7.entry_scope.rules?.some(r => String(row.department ?? '').trim() === r.department && (r.section === '*' || String(row.section ?? '').trim() === r.section) && (r.level === '*' || String(row.level ?? '').trim() === r.level));
export function entryTimeAllowed(admin, date, now = Date.now()) {
  if (admin) return true;
  const local = new Date(now + 6 * 3600000);
  return date === local.toISOString().slice(0, 10) && local.getUTCHours() < 17;
}
export class Service extends Store {
  constructor(env, request) {
    super(env.DB); this.secret = env.AUTH_SECRET; this.request = request;
    this.rpc = this.rpc.bind(this); this.rest = this.rest.bind(this); this.auth = this.auth.bind(this);
    this.ip = request?.headers.get('CF-Connecting-IP') || 'local';
  }
  async first(table, q, secrets=false) { return (await this.read(table, q + (q ? '&' : '') + 'limit=1', undefined, secrets))[0]; }
  async limit(identity) {
    const key = await digest(identity), now = Date.now();
    const row = await this.db.prepare('INSERT INTO login_limits(key,attempts,period_start) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN period_start<? THEN 1 ELSE attempts+1 END,period_start=CASE WHEN period_start<? THEN excluded.period_start ELSE period_start END RETURNING attempts').bind(key, now, now-900000, now-900000).first();
    if (row.attempts > 10) fail('Too many login attempts. Try again in 15 minutes.', 429);
    return key;
  }
  async loginDatacell(b) {
    if (typeof b.p_username !== 'string' || b.p_username.length > 200 || !/^[a-f0-9]{64}$/.test(b.p_token_hash)) fail('Invalid login');
    const key = await this.limit('datacell:' + this.ip + ':' + b.p_username);
    const user = await this.first('users', 'name=eq.' + encodeURIComponent(b.p_username), true);
    // A dummy PBKDF2 hash keeps unknown-account responses on the password-check path.
    if (!await verifyPassword(b.p_password, user?.password || 'pbkdf2$100000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000')) fail('Incorrect name or password', 401);
    const version = await digest(user.password);
    await this.batch([
      this.db.prepare('DELETE FROM login_limits WHERE key=?').bind(key),
      this.db.prepare('DELETE FROM sessions WHERE refresh_expires_at<? OR (refresh_hash IS NULL AND expires_at<?)').bind(Date.now(),Date.now()),
      this.db.prepare('INSERT INTO sessions(token_hash,kind,account_id,credential_version,expires_at) VALUES(?,?,?,?,?)').bind(b.p_token_hash,'datacell',user.name,version,Date.now()+8*3600000)
    ]);
    return { name: user.name, color: user.color };
  }
  async session(tokenHash, kind) {
    const session = await this.db.prepare('SELECT * FROM sessions WHERE token_hash=? AND kind=? AND expires_at>?').bind(tokenHash,kind,Date.now()).first();
    if (!session) fail('Please log in', 401);
    if (kind === 'datacell') {
      const account = await this.first('users','name=eq.'+encodeURIComponent(session.account_id),true);
      if (!account || await digest(account.password) !== session.credential_version) fail('Please log in',401);
      const access = await this.first('module_access','username=eq.'+encodeURIComponent(account.name));
      return {name:account.name,color:account.color,modules:access?.modules||'',is_admin:account.name==='admin',credentialVersion:session.credential_version};
    }
    const credential = await this.db.prepare('SELECT credential_version FROM auth_credentials WHERE id=?').bind(session.account_id).first();
    const account = await this.first('work_hour_accounts','id=eq.'+encodeURIComponent(session.account_id));
    if (!credential || credential.credential_version !== session.credential_version) fail('Please log in',401);
    if (!account?.active) fail('This account is inactive or has no Work Hour access',403);
    return account;
  }
  async auth(path, method, body, token) {
    if (path === 'user' && method === 'GET') return {id:(await this.session(await digest(token || ''),'work-hour')).id};
    if (path === 'admin/users' && method === 'POST') {
      const id = crypto.randomUUID(), encoded = await hashPassword(body.password);
      await this.db.prepare('INSERT INTO auth_credentials(id,password_hash,credential_version) VALUES(?,?,?)').bind(id,encoded,await digest(encoded)).run();
      return {id};
    }
    if (path.startsWith('admin/users/')) {
      const id=path.slice('admin/users/'.length);
      if (method==='DELETE') { await this.db.prepare('DELETE FROM auth_credentials WHERE id=?').bind(id).run(); return {}; }
      if (method==='PUT') {
        if (body.password) {const encoded=await hashPassword(body.password);await this.batch([this.db.prepare('UPDATE auth_credentials SET password_hash=?,credential_version=? WHERE id=?').bind(encoded,await digest(encoded),id),this.db.prepare('DELETE FROM sessions WHERE account_id=? AND kind=?').bind(id,'work-hour')]);}
        return {id};
      }
    }
    fail('Unsupported authentication operation');
  }
  async issueWorkSession(account, credential, oldRefresh) {
    const access = randomToken(), refresh = randomToken(), now = Date.now();
    const statements=[];
    if(oldRefresh) statements.push(this.guard('EXISTS(SELECT 1 FROM sessions WHERE refresh_hash=? AND refresh_expires_at>?)',[oldRefresh,now]),this.db.prepare('DELETE FROM sessions WHERE refresh_hash=?').bind(oldRefresh));
    statements.push(this.db.prepare('INSERT INTO sessions(token_hash,kind,account_id,credential_version,expires_at,refresh_hash,refresh_expires_at) VALUES(?,?,?,?,?,?,?)').bind(await digest(access),'work-hour',account.id,credential.credential_version,now+3600000,await digest(refresh),now+7*86400000));
    await this.batch(statements);
    return {access_token:access,refresh_token:refresh,token_type:'bearer',expires_in:3600,user:{id:account.id,email:account.email}};
  }
  async workLogin(grant, b) {
    let account, credential, oldRefresh;
    if(grant==='password') {
      const email=String(b.email||'').trim().toLowerCase();
      const key=await this.limit('work-hour:'+this.ip+':'+email);
      account=await this.first('work_hour_accounts','email=eq.'+encodeURIComponent(email));
      credential=account?await this.db.prepare('SELECT * FROM auth_credentials WHERE id=?').bind(account.id).first():null;
      if(!await verifyPassword(b.password,credential?.password_hash||'pbkdf2$100000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000'))fail('Invalid email or password',401);
      if(!account.active)fail('This account is inactive',403);
      if(credential.password_hash.startsWith('$2')) {
        const hashed=await hashPassword(b.password);credential={...credential,password_hash:hashed,credential_version:await digest(hashed)};
        await this.db.prepare('UPDATE auth_credentials SET password_hash=?,credential_version=? WHERE id=?').bind(hashed,credential.credential_version,account.id).run();
      }
      await this.db.prepare('DELETE FROM login_limits WHERE key=?').bind(key).run();
    } else if(grant==='refresh_token') {
      oldRefresh=await digest(String(b.refresh_token||''));
      const previous=await this.db.prepare('SELECT * FROM sessions WHERE refresh_hash=? AND kind=? AND refresh_expires_at>?').bind(oldRefresh,'work-hour',Date.now()).first();
      if(!previous)fail('Please log in',401);
      account=await this.first('work_hour_accounts','id=eq.'+encodeURIComponent(previous.account_id));
      credential=await this.db.prepare('SELECT * FROM auth_credentials WHERE id=?').bind(previous.account_id).first();
      if(!account?.active||credential?.credential_version!==previous.credential_version)fail('Please log in',401);
    } else fail('Unsupported grant');
    return this.issueWorkSession(account,credential,oldRefresh);
  }
  async publicationHead() {
    const head=await this.db.prepare('SELECT * FROM publication_head WHERE id=1').first();
    return head?{version:head.version,publishedAt:head.published_at,publishedBy:head.published_by}:null;
  }
  async publish(b) {
    let actor;
    if(b.p_actor_kind==='datacell') {const p=await this.session(b.p_actor_id,'datacell');if(!p.is_admin)fail('Administrator access required',403);actor=p.name;}
    else if(b.p_actor_kind==='work-hour') {const p=await this.first('work_hour_accounts','id=eq.'+encodeURIComponent(b.p_actor_id));if(!p?.active||!p.is_admin)fail('Administrator access required',403);actor=p.user_name;}
    else fail('Unsupported administrator');
    const version=crypto.randomUUID(),at=new Date().toISOString(),statements=[];
    statements.push(this.guard(b.p_expected_version==null?'NOT EXISTS(SELECT 1 FROM publication_head WHERE id=1)':'EXISTS(SELECT 1 FROM publication_head WHERE id=1 AND version=?)',b.p_expected_version==null?[]:[b.p_expected_version]));
    statements.push(this.db.prepare('INSERT INTO publication_versions(version,published_at,published_by) VALUES(?,?,?)').bind(version,at,actor));
    for(const table of sources) {const columns=Object.keys(spec[table].columns).map(x=>'"'+x+'"').join(',');statements.push(this.db.prepare('INSERT INTO "published_'+table+'" ('+columns+',_publication_version) SELECT '+columns+',? FROM "'+table+'"').bind(version));}
    statements.push(this.db.prepare('INSERT INTO publication_head(id,version,published_at,published_by) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,published_at=excluded.published_at,published_by=excluded.published_by').bind(version,at,actor));
    for(const table of sources)statements.push(this.db.prepare('DELETE FROM "published_'+table+'" WHERE _publication_version NOT IN (SELECT version FROM publication_versions ORDER BY published_at DESC,version DESC LIMIT 2)'));
    statements.push(this.db.prepare('DELETE FROM publication_versions WHERE version NOT IN (SELECT version FROM publication_versions ORDER BY published_at DESC,version DESC LIMIT 2)'));
    await this.batch(statements);return {version,publishedAt:at,publishedBy:actor};
  }
  async replaceUsers(b) {
    const actor=await this.session(b.p_token_hash,'datacell');if(!actor.is_admin)fail('Administrator access required',403);
    if(!Array.isArray(b.p_rows)||!b.p_rows.length||b.p_rows.length>200||!b.p_rows.some(r=>r.name==='admin')||new Set(b.p_rows.map(r=>r.name)).size!==b.p_rows.length)fail('Valid unique accounts including Admin are required');
    const old=await this.read('users','limit=10000',undefined,true),statements=[];
    for(const input of b.p_rows) {
      if(typeof input.name!=='string'||!input.name.trim()||input.name.length>200)fail('Account name required');
      const previous=old.find(r=>r.name===input.name);
      const password=input.password?await hashPassword(input.password):previous?.password;
      if(!password)fail('Password required for a new account');
      statements.push(this.insertStatement('users',{name:input.name,password,color:input.color||'#60a5fa'},true,'name'));
    }
    const names=b.p_rows.map(r=>r.name);
    statements.push(this.db.prepare('DELETE FROM users WHERE name NOT IN ('+names.map(()=>'?').join(',')+')').bind(...names));
    await this.batch(statements);return null;
  }
  async authorizeDatacellMutation(profile,b,q) {
    if(profile.is_admin)return;
    const rows=b.body==null?[]:Array.isArray(b.body)?b.body:[b.body];
    const current=['PATCH','DELETE'].includes(b.method)?await this.read(b.table,q):[];
    const targets=[...current,...rows];
    const ownsTask=async sl=>{const task=await this.first('tasks','sl=eq.'+encodeURIComponent(sl));return task?.person===profile.name||task?.person==='Sayed/Johir'&&['Sayed','Johir'].includes(profile.name);};
    if(b.table==='done_state'&&targets.some(r=>r.username!=null&&r.username!==profile.name))fail('Status belongs to another account',403);
    if(['working_hours_defaults','working_hours_daily'].includes(b.table)&&!profile.modules.split(',').includes('workinghours')&&targets.some(r=>r.person!=null&&r.person!==profile.name))fail('Working hours access denied',403);
    if(['task_remarks','task_completions'].includes(b.table))for(const row of targets)if(row.task_sl!=null&&!await ownsTask(row.task_sl))fail('Task access denied',403);
    if(b.table==='leave_applications'&&!profile.modules.includes('__role__:Supervisor')&&!profile.modules.includes('__role__:Section Incharge')&&targets.some(r=>r.employee!=null&&r.employee!==profile.name))fail('Leave application belongs to another account',403);
    if(b.table==='meta')for(const row of targets){
      const match=String(row.key||'').match(/^(taskRemark|taskCompletion):(\d+)/);
      if(match&&!await ownsTask(match[2]))fail('Task access denied',403);
    }
  }
  async saveEntries(actorId, entries, deletions=[]) {
    if(!Array.isArray(entries)||!Array.isArray(deletions)||entries.length+deletions.length<1||entries.length+deletions.length>200)fail('Send 1 to 200 changes');
    const account=await this.first('work_hour_accounts','id=eq.'+encodeURIComponent(actorId));
    if(!account?.active)fail('Active account required',403);
    if(entries.length&&!can(account,'p7','edit')||deletions.length&&!can(account,'p7','delete'))fail('User Interface write access required',403);
    const ids=[...entries.map(e=>e.row?.id),...deletions.map(e=>e.id)];
    if(ids.some(id=>typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))||new Set(ids).size!==ids.length)fail('Duplicate, missing or overlapping entry ID');
    const stamp=new Date().toISOString(),statements=[],saved=[],deleted=[];
    // Permissions and revision checks run again inside D1's atomic batch.
    statements.push(this.guard('EXISTS(SELECT 1 FROM work_hour_accounts WHERE id=? AND active=1 AND updated_at=?)',[account.id,account.updated_at]));
    for(const item of [...deletions.map(d=>({...d,remove:true})),...entries]) {
      const id=item.remove?item.id:item.row.id,previous=await this.first('work_hour_user_interface','id=eq.'+encodeURIComponent(id));
      if(previous) {
        if(!item.expected_updated_at||previous.updated_at!==item.expected_updated_at)fail('Entry changed in another session. Reload before saving.',409);
        if(!allowed(account,previous))fail('Existing entry is outside your assigned scope',403);
        if(!entryTimeAllowed(account.is_admin,previous.work_date))fail('Locked: regular users may change only today before 5:00 PM Bangladesh time',403);
        statements.push(this.guard('EXISTS(SELECT 1 FROM work_hour_user_interface WHERE id=? AND updated_at=?)',[id,item.expected_updated_at]));
      }else{
        if(item.remove||item.expected_updated_at!=null)fail('Entry no longer exists. Reload before saving.',409);
        statements.push(this.guard('NOT EXISTS(SELECT 1 FROM work_hour_user_interface WHERE id=?)',[id]));
      }
      if(item.remove) {
        statements.push(this.db.prepare('INSERT INTO entry_archive(id,original_id,row_data,reason,actor_id,archived_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),id,JSON.stringify(previous),'User Interface row deleted',account.id,stamp));
        statements.push(this.db.prepare('DELETE FROM work_hour_user_interface WHERE id=?').bind(id));deleted.push(id);continue;
      }
      const defaults={department:'',section:'',level:'',line_no:'',buyer:'',ewo:'',reason_eot:'',responsible_department:''};
      const row={...Object.fromEntries(Object.keys(spec.work_hour_user_interface.columns).map(k=>[k,null])),...defaults,...item.row};
      for(const key of Object.keys(row))if(!Object.hasOwn(spec.work_hour_user_interface.columns,key))fail('Unsupported entry field');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(row.work_date||'')||!norm(row.department)||!norm(row.section))fail('Date, Department and Section are required');
      if(['sewing','quality assurance'].includes(norm(row.department))&&norm(row.section)==='sewing'&&(!norm(row.level)||!norm(row.line_no)))fail('Sewing entries require Level and Line');
      if(!allowed(account,row))fail('Entry is outside your assigned Department / Section / Level',403);
      if(!entryTimeAllowed(account.is_admin,row.work_date))fail('Locked: regular users may change only today before 5:00 PM Bangladesh time',403);
      row.iron_man=previous?.iron_man??null;row.ot_5_pm=row.asking_manpower;
      for(const field of ['present_manpower','asking_manpower','asking_hour',...hourKeys,'iron_man','staff'])if(row[field]!=null&&(!Number.isFinite(Number(row[field]))||Number(row[field])<0||field!=='asking_hour'&&!Number.isSafeInteger(Number(row[field]))))fail('Invalid quantity: '+field);
      let last=Number(row.ot_5_pm||0);
      for(const field of hourKeys.slice(1)){const n=Number(row[field]||0);if(n>last)fail('Hourly manpower cannot exceed the previous hour');last=n;}
      const sumFields=[...hourKeys.slice(1),'staff'];row.total_manpower=sumFields.some(k=>row[k]!=null)?sumFields.reduce((n,k)=>n+Number(row[k]||0),0):null;
      row.created_at=previous?.created_at||stamp;row.updated_at=stamp;row.updated_by=account.user_name;
      if(previous){
        const fields=Object.keys(row),values=fields.map(k=>this.encode('work_hour_user_interface',k,row[k]));
        statements.push(this.db.prepare('UPDATE work_hour_user_interface SET '+fields.map(k=>'"'+k+'"=?').join(',')+',_identity=? WHERE id=?').bind(...values,entryIdentity(row),id));
      }else statements.push(this.insertStatement('work_hour_user_interface',row));
      saved.push(row);
    }
    await this.batch(statements);return {rows:saved,deleted};
  }
  async rpc(name,b={}) {
    if(name==='datacell_login')return this.loginDatacell(b);
    if(name==='datacell_session')return this.session(b.p_token_hash,'datacell');
    if(name==='datacell_logout'){await this.db.prepare('DELETE FROM sessions WHERE token_hash=? AND kind=?').bind(b.p_token_hash,'datacell').run();return null;}
    if(name==='datacell_publication_head')return this.publicationHead();
    if(name==='datacell_publish')return this.publish(b);
    if(name==='datacell_replace_users')return this.replaceUsers(b);
    if(name==='datacell_read_published') {
      if(!sources.includes(b.p_source)||!await this.db.prepare('SELECT version FROM publication_versions WHERE version=?').bind(b.p_version).first())fail('Published report unavailable',409);
      return this.read(b.p_source,new URLSearchParams(b.p_query),b.p_version,false,b.scope);
    }
    if(name==='work_hour_save_entries')return (await this.saveEntries(b.actor_id,b.entries)).rows;
    if(name==='work_hour_apply_entries')return this.saveEntries(b.actor_id,b.entries||[],b.deletions||[]);
    fail('Unsupported operation');
  }
}
