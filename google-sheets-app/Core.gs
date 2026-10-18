/* Google Sheets storage engine. No network or provider-specific SDK. */
var DataCellSheets = (function () {
  'use strict';
  const KEYS = {
    tasks:['sl'], users:['name'], done_state:['username'], module_access:['username'],
    meta:['key'], app_state:['key'], task_completions:['task_sl','actual_date'],
    task_remarks:['task_sl','remark_date'], working_hours_defaults:['person'],
    working_hours_daily:['person','work_date'], multi_skill_assignments:['task_sl'],
    user_roles:['username'], leave_applications:['id'],
    leave_report_coverage:['application_id','task_sl'], work_hour_approval_state:['id'],
    work_hour_department_sections:['id'], work_hour_user_interface:['id'],
    work_hour_ot_cost:['work_date','employee_id'], work_hour_daily_punch:['work_date','employee_id']
  };
  const TABLES = Object.keys(KEYS);
  const WH = {
    work_hour_approval_state:['p1','p6'], work_hour_department_sections:['p3'],
    work_hour_user_interface:['p1','p2','p7'], work_hour_ot_cost:['p2','p4'],
    work_hour_daily_punch:['p5','p7']
  };
  const clone = x => JSON.parse(JSON.stringify(x));
  const same = (a,b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const fail = (message,status=400,code) => { throw Object.assign(new Error(message),{status,code}); };
  const keys = x => Object.keys(x || {});
  const changed = (a,b) => keys(b).filter(k => !same(a[k],b[k]));
  const own = (p,t) => String(t.person || '').split('/').map(x=>x.trim()).includes(p.name);
  const norm = value => String(value??'').trim().replace(/\s+/g,' ').toLowerCase();
  const level = value => norm(value).replace(/^level\s*[-:]?\s*0*(\d+)$/,'level-$1');
  const line = value => {const s=norm(value),m=/^(?:(?:ln|line)\s*[-:]?\s*)?(\d+)$/.exec(s);return m?m[1].replace(/^0+(?=\d)/,''):s;};
  const entryKey = row => JSON.stringify([row.work_date,norm(row.department),norm(row.section),level(row.level),line(row.line_no)]);
  const mods = p => String(p.modules || '').split(',').filter(Boolean);
  const key = (table,row) => JSON.stringify(KEYS[table].map(k=>row[k]));
  function date(value,optional=true) {
    if (optional && (value === '' || value == null)) return '';
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('Invalid calendar date');
    const d=new Date(value+'T00:00:00.000Z');
    if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10)!==value) fail('Invalid calendar date');
    return value;
  }
  function number(value,min=0,max=100000000) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value<min || value>max) fail('Invalid numeric value');
    return value;
  }
  function query(text='') {
    if (typeof text!=='string' || text.length>30000) fail('Unsupported query');
    const pairs=text ? text.split('&').filter(Boolean).map(part=>{
      const i=part.indexOf('=');
      if(i<0) fail('Invalid query');
      return [decodeURIComponent(part.slice(0,i).replace(/\+/g,' ')),decodeURIComponent(part.slice(i+1).replace(/\+/g,' '))];
    }) : [];
    const result=Object.create(null);
    for(const [k,v] of pairs) {
      if(!/^[a-z_][a-z_0-9]*$/.test(k)||k in result) fail('Unsupported query field');
      result[k]=v;
    }
    return result;
  }
  function predicate(q) {
    const filters=Object.entries(q).filter(([k])=>!['select','order','limit','offset','on_conflict'].includes(k));
    const tests=filters.map(([field,expression])=>{
      const m=/^(eq|neq|gt|gte|lt|lte|in|like|is|not\.is)\.(.*)$/.exec(expression);
      if(!m)fail('Unsupported filter');
      const [,op,want]=m;
      if(op==='in'&&!/^\([^()]*\)$/.test(want))fail('Invalid in filter');
      return row=>{
        const value=row[field],s=String(value??'');
        if(op==='eq')return s===want;
        if(op==='neq')return s!==want;
        if(op==='is')return want==='null'?value==null:want==='true'?value===true:want==='false'?value===false:false;
        if(op==='not.is')return want==='null'?value!=null:false;
        if(op==='in')return want.slice(1,-1).split(',').map(x=>x.replace(/^"|"$/g,'')).includes(s);
        if(op==='like'){const rx=want.replace(/[.+?^$()|[\]{}\\]/g,'\\$&').replace(/\*/g,'.*').replace(/%/g,'.*');return new RegExp('^'+rx+'$').test(s);}
        const v=typeof value==='number'?value:s,w=typeof value==='number'?Number(want):want;
        return op==='gt'?v>w:op==='gte'?v>=w:op==='lt'?v<w:v<=w;
      };
    });
    return row=>tests.every(test=>test(row));
  }
  function select(rows,q) {
    let out=rows.filter(predicate(q));
    if(q.order) {
      const orders=q.order.split(',').map(x=>{
        const m=/^([a-z_][a-z_0-9]*)(?:\.(asc|desc))?(?:\.nulls(?:first|last))?$/.exec(x);
        if(!m)fail('Unsupported sort');return [m[1],m[2]==='desc'?-1:1];
      });
      out=out.slice().sort((a,b)=>{for(const [f,d] of orders){if(a[f]==b[f])continue;return (a[f]==null?-1:b[f]==null?1:a[f]<b[f]?-1:1)*d;}return 0;});
    }
    const offset=q.offset==null?0:Number(q.offset),limit=q.limit==null?10000:Number(q.limit);
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<0||limit>10000)fail('Invalid page');
    out=out.slice(offset,offset+limit);
    if(q.select&&q.select!=='*') {
      const fields=q.select.split(',');
      if(fields.some(f=>!/^[a-z_][a-z_0-9]*$/.test(f)))fail('Unsupported projection');
      out=out.map(r=>Object.fromEntries(fields.map(f=>[f,r[f]??null])));
    }
    return clone(out);
  }
  class Service {
    constructor(state,env) { this.s=state;this.e=env;TABLES.forEach(t=>state.tables[t] ||= []); }
    rows(t){if(!TABLES.includes(t))fail('Unknown table');return this.s.tables[t];}
    clock(){return this.e.clock();}
    log(actor,action,details){this.s.audit.push({at:this.clock().iso,actor,action,details});if(this.s.audit.length>5000)this.s.audit.splice(0,this.s.audit.length-5000);}
    profile(token) {
      if(typeof token!=='string'||token.length>200)fail('Please log in',401);
      const digest=this.e.hash(token),session=this.s.sessions[digest];
      if(!session||session.expires<=this.e.now())fail('Session expired. Please log in',401);
      const user=this.rows('users').find(u=>u.name===session.name),credential=this.s.accounts[session.name];
      if(!user||user.active===false||!credential||credential.version!==session.version)fail('Account changed. Please log in',401);
      return {...user,is_admin:user.role==='admin',modules:this.rows('module_access').find(x=>x.username===user.name)?.modules||''};
    }
    credential(name,password) {
      if(typeof password!=='string'||password.length<10||password.length>256)fail('Password must contain 10–256 characters');
      const salt=this.e.random(),previous=this.s.accounts[name];
      this.s.accounts[name]={salt,hash:this.e.mac(JSON.stringify([salt,password])),version:(previous?.version||0)+1};
    }
    login(b) {
      if(typeof b.name!=='string'||b.name.length>200||typeof b.password!=='string'||b.password.length>256)fail('Invalid login');
      const bucket=this.e.hash(b.name.toLowerCase()),now=this.e.now();
      for(const k of keys(this.s.rates))if(this.s.rates[k].until<=now)delete this.s.rates[k];
      const rate=this.s.rates[bucket]||{count:0,until:now+15*60*1000};
      const global=this.s.rates.global||{count:0,until:now+15*60*1000};
      if(rate.count>=10||global.count>=500)fail('Too many attempts. Try again later',429);
      const user=this.rows('users').find(x=>x.name===b.name||x.email&&x.email.toLowerCase()===b.name.toLowerCase());
      const cred=user&&this.s.accounts[user.name];
      const actual=this.e.mac(JSON.stringify([cred?.salt||'invalid-account',b.password]));
      const expected=cred?.hash||this.e.mac('invalid-password');
      let diff=actual.length^expected.length;
      for(let i=0;i<actual.length;i++)diff|=actual.charCodeAt(i)^(expected.charCodeAt(i)||0);
      if(!user||user.active===false||!cred||diff!==0) {
        rate.count++;global.count++;this.s.rates[bucket]=rate;this.s.rates.global=global;
        fail('Incorrect account or password',401);
      }
      delete this.s.rates[bucket];
      for(const k of keys(this.s.sessions))if(this.s.sessions[k].expires<=now)delete this.s.sessions[k];
      if(keys(this.s.sessions).length>=1000)fail('Session limit reached',429);
      const token=this.e.random()+this.e.random();
      this.s.sessions[this.e.hash(token)]={name:user.name,version:cred.version,expires:now+8*60*60*1000};
      this.log(user.name,'LOGIN',{});
      return {token,name:user.name,expiresIn:28800};
    }
    role(p){return this.rows('user_roles').find(x=>x.username===p.name)?.role||mods(p).find(x=>x.startsWith('__role__:'))?.slice(9)||'Team Member';}
    whProfile(p) {
      if(!p.is_admin&&!mods(p).includes('workhourapproval'))fail('Work Hour module access required',403);
      const permissions=clone(this.s.whPermissions[p.name]||{});
      return {id:p.id||p.name,user_name:p.name,email:p.email||'',department:p.department||'',section:p.section||'',designation:p.designation||'',office_id:p.office_id||'',active:true,is_admin:p.is_admin,permissions,server_now:this.clock().iso,publication:this.s.published?{version:this.s.published.version,publishedAt:this.s.published.publishedAt}:null};
    }
    permit(p,tab,action) {
      if(p.is_admin)return true;
      const w=this.whProfile(p);
      if(w.permissions[tab]?.view!==true||action!=='view'&&w.permissions[tab]?.[action]!==true)fail('Work Hour permission denied: '+tab+' '+action,403);
      return true;
    }
    scope(p,row) {
      if(p.is_admin)return true;
      const s=this.s.whPermissions[p.name]?.p7?.entry_scope;
      if(!s||s.mode!=='selected')return s?.mode==='all';
      const norm=x=>String(x??'').trim().replace(/\s+/g,' ').toLowerCase();
      return (s.rules||[]).some(r=>norm(r.department)===norm(row.department)&&(r.section==='*'||norm(r.section)===norm(row.section))&&(r.level==='*'||norm(r.level)===norm(row.level)));
    }
    readRows(p,t,source,q,b={}) {
      let rows=source[t]||[];
      if(t==='users')return rows.filter(x=>p.is_admin||x.active!==false).map(({name,color,email,role,active})=>({name,color:color||'#60a5fa',password:'',...(p.is_admin?{email,role,active}:{})}));
      if(t==='module_access')return rows.filter(x=>p.is_admin||x.username===p.name);
      if(p.is_admin)return rows;
      if(WH[t]) {
        const tab=b.context||({work_hour_approval_state:'p1',work_hour_department_sections:'p3',work_hour_user_interface:'p7',work_hour_ot_cost:'p4',work_hour_daily_punch:'p5'}[t]);
        if(!WH[t].includes(tab))fail('Invalid report context',403);
        this.permit(p,tab,'view');
        const cols=q.select&&q.select!=='*'?q.select.split(','):null;
        if(tab==='p2'&&t==='work_hour_ot_cost'&&(!cols||cols.some(c=>!['work_date','department','total_ot_hour'].includes(c))))fail('EOT summary columns only',403);
        if(tab==='p7'&&t==='work_hour_daily_punch'&&(!cols||cols.some(c=>!['work_date','employee_id','department','section','line'].includes(c))))fail('Punch count columns only',403);
        if(tab==='p2'&&t==='work_hour_ot_cost'||tab==='p7'&&t==='work_hour_daily_punch'){
          const fields=tab==='p2'?['work_date','department','total_ot_hour']:['work_date','employee_id','department','section','line'];
          if(keys(q).some(k=>!['select','order','limit','offset'].includes(k)&&!fields.includes(k))||(q.order||'').split(',').filter(Boolean).some(v=>!fields.concat('id').includes(v.split('.')[0])))fail('Report filter not allowed',403);
        }
        if(t==='work_hour_user_interface'&&tab==='p7')rows=rows.filter(r=>this.scope(p,r));
        return rows;
      }
      const reports=mods(p).some(m=>['overview','kpi','all','plantime'].includes(m));
      if(t==='tasks')return reports?rows:this.rows('tasks').filter(r=>own(p,r));
      if(t==='done_state')return reports?rows:this.rows('done_state').filter(r=>r.username===p.name);
      if(['task_completions','task_remarks'].includes(t))return reports?rows:this.rows(t).filter(r=>this.rows('tasks').some(task=>Number(task.sl)===Number(r.task_sl)&&own(p,task)));
      if(t==='working_hours_defaults'||t==='working_hours_daily')return mods(p).includes('workinghours')||reports?rows:rows.filter(r=>r.person===p.name);
      if(t==='leave_applications')return mods(p).includes('leave')?rows:rows.filter(r=>r.employee===p.name);
      if(t==='leave_report_coverage')return rows.filter(r=>r.assignee===p.name||mods(p).includes('leave')||this.rows('leave_applications').some(a=>a.id===r.application_id&&a.employee===p.name));
      if(t==='meta')return rows.filter(r=>['version','nextSl'].includes(r.key));
      if(t==='multi_skill_assignments'||t==='user_roles'||t==='app_state')return rows;
      fail('Read access denied',403);
    }
    validate(t,r) {
      if(!r||typeof r!=='object'||Array.isArray(r))fail('Invalid record');
      if(keys(r).some(k=>['__proto__','prototype','constructor'].includes(k)))fail('Invalid record key');
      for(const f of KEYS[t])if(r[f]==null||r[f]==='')fail('Missing record key: '+f);
      if(JSON.stringify(r).length>2000000)fail('Record too large');
      if(t==='tasks') {
        number(r.sl,1);if(!Number.isSafeInteger(r.sl))fail('Invalid task number');
        if(typeof r.task!=='string'||!r.task.trim()||r.task.length>2000)fail('Task title required');
        if(typeof r.priority!=='boolean')fail('Priority must be boolean');
        if(r.lead_time&&!/^\d+(?:\.\d+)?\s*(?:min|h|hours?)?$/i.test(String(r.lead_time)))fail('Invalid lead time');
        for(const f of ['plan_date','actual_date'])date(r[f]);
        for(const f of ['plan_time','actual_time'])if(r[f]&&!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(r[f]))fail('Invalid time');
        if(r.person&&!String(r.person).split('/').every(name=>this.rows('users').some(u=>u.name===name.trim()&&u.active!==false)))fail('Assignee must be an active account');
      }
      if(t==='working_hours_defaults'||t==='working_hours_daily'){number(r.minutes,0,1440);if(t.endsWith('daily'))date(r.work_date,false);}
      if(t==='task_remarks'){number(r.task_sl,1);date(r.remark_date,false);if(String(r.remark||'').length>4000)fail('Remark too long');}
      if(t==='task_completions'){number(r.task_sl,1);date(r.actual_date,false);}
      if(t==='leave_applications'){date(r.from_date,false);date(r.to_date,false);if(r.to_date<r.from_date)fail('Invalid leave range');if(!['Pending','Approved','Rejected'].includes(r.status))fail('Invalid leave status');}
      if(t==='work_hour_department_sections'&&(!String(r.department||'').trim()||!String(r.section||'').trim()))fail('Department and Section required');
      if(t==='work_hour_ot_cost')for(const field of ['gross_salary','ot_rate','total_ot_hour','regular_ot_hour','extra_ot_hour','regular_ot_cost','extra_ot_cost','total_ot_cost'])if(r[field]!=null)number(r[field]);
      if(t==='work_hour_ot_cost'||t==='work_hour_daily_punch'){date(r.work_date,false);if(!String(r.employee_id||'').trim())fail('Employee ID required');}
      if(t==='work_hour_user_interface') {
        date(r.work_date,false);
        if(!r.department||!r.section)fail('Department and Section required');
        if(['sewing','quality assurance'].includes(norm(r.department))&&norm(r.section)==='sewing'&&(!level(r.level)||!line(r.line_no)))fail('Level and line are required for Sewing');
        const fields=['present_manpower','asking_manpower','asking_hour','ot_5_pm','ot_6_pm','ot_7_pm','ot_8_pm','ot_9_pm','ot_10_pm','ot_11_pm','ot_12_am','ot_1_am','staff'];
        fields.forEach(f=>{if(r[f]!=null){number(r[f],0,f==='asking_hour'?24:100000);if(f!=='asking_hour'&&!Number.isSafeInteger(r[f]))fail('Manpower must be a whole number');}});
        const hours=fields.slice(3,12);r.ot_5_pm=r.asking_manpower??null;
        for(let i=1;i<hours.length;i++)if(r[hours[i]]!=null&&r[hours[i]]>(r[hours[i-1]]??0))fail('Manpower cannot increase after the previous hour');
        const sum=[...hours.slice(1),'staff'];r.total_manpower=sum.some(f=>r[f]!=null)?sum.reduce((n,f)=>n+(r[f]||0),0):null;
      }
      if(t==='work_hour_approval_state'&&!Array.isArray(r.rows))fail('Approval rows must be an array');
      return r;
    }
    authorize(p,t,method,old,next) {
      if(p.is_admin)return;
      const fields=changed(old||{},next||{}),m=mods(p),target=next||old;
      if(WH[t]) {
        const tab={work_hour_approval_state:'p6',work_hour_department_sections:'p3',work_hour_user_interface:'p7',work_hour_ot_cost:'p4',work_hour_daily_punch:'p5'}[t];
        this.permit(p,tab,method==='DELETE'?'delete':'edit');
        if(t==='work_hour_user_interface') {
          const c=this.clock();
          if(target.work_date!==c.date||c.time>='17:00:00')fail('Entry editing closes at 17:00 Asia/Dhaka',403);
          if(!this.scope(p,target)||old&&!this.scope(p,old))fail('Entry outside assigned scope',403);
        }
        return;
      }
      if(['users','module_access','user_roles'].includes(t))fail('Administrator access required',403);
      if(t==='tasks') {
        if(method!=='PATCH'||!old)fail('Administrator access required',403);
        const assigned=own(p,old),allowed=assigned?['actual_date','actual_time','lead_time']:m.includes('plantime')?['plan_time']:[];
        if(fields.some(f=>!allowed.includes(f)))fail('Task edit access denied',403);
        if(next.actual_date&&next.actual_date!==this.clock().date)fail('Only today can be completed',403);
        if(fields.some(f=>['actual_date','actual_time'].includes(f))){
          if(old.actual_date===this.clock().date&&old.actual_time)fail('Today is already completed',403);
          if(!next.actual_date||!next.actual_time)fail('Completion requires date and time');
          const minutes=s=>Number(s.slice(0,2))*60+Number(s.slice(3,5));
          if(Math.abs(minutes(next.actual_time)-minutes(this.clock().time))>2)fail('Completion time must match the server clock',403);
        }
        if(next.actual_time&&old.plan_time&&next.actual_time>old.plan_time&&!this.rows('task_remarks').some(r=>Number(r.task_sl)===Number(old.sl)&&r.remark_date===next.actual_date&&String(r.remark||'').trim()))fail('Late completion requires a saved remark');
        return;
      }
      if(t==='task_remarks'||t==='task_completions'){const task=this.rows('tasks').find(r=>Number(r.sl)===Number(target.task_sl)&&own(p,r));if(!task)fail('Task access denied',403);if(t==='task_completions'&&(method==='DELETE'||target.actual_date!==task.actual_date||target.actual_time!==task.actual_time||target.person!==task.person||target.actual_date===this.clock().date))fail('Only the previous saved completion can be archived',403);return;}
      if(t==='done_state'){if(target.username!==p.name)fail('Account access denied',403);if(method!=='DELETE'&&String(target.done_sls||'').split(',').filter(Boolean).some(id=>!this.rows('tasks').some(task=>String(task.sl)===id&&own(p,task)&&task.actual_date&&task.actual_time)))fail('Status requires an authoritative saved completion',403);return;}
      if(t==='working_hours_defaults'||t==='working_hours_daily'){if(!m.includes('workinghours')&&target.person!==p.name)fail('Working hours access denied',403);if(target.work_date&&target.work_date<this.clock().date)fail('Past dates are locked',403);return;}
      if(t==='multi_skill_assignments'){if(!m.includes('plantime'))fail('Multi Skill access required',403);return;}
      if(t==='app_state'||t==='meta'){if(method!=='POST'||target.key!=='version')fail('Administrator access required',403);return;}
      if(t==='leave_applications') {
        const role=this.role(p);
        if(!old){if(next.employee!==p.name||next.status!=='Pending'||(next.supervisor_status||'Pending')!=='Pending'||(next.section_status||'Pending')!=='Pending')fail('New leave must belong to caller and be pending',403);return;}
        if(role==='Supervisor'&&m.includes('leave')) {
          const allowed=['supervisor_status','supervisor_by','supervisor_at','status','rejected_stage'];
          if(fields.some(f=>!allowed.includes(f)))fail('Supervisor review fields only',403);
          if(next.supervisor_by&&next.supervisor_by!==p.name)fail('Reviewer identity mismatch',403);
          if(next.status==='Approved')fail('Section approval required',403);
          return;
        }
        if(role==='Section Incharge'&&m.includes('leave')) {
          const allowed=['section_status','section_by','section_at','status','rejected_stage'];
          if(old.supervisor_status!=='Approved'||fields.some(f=>!allowed.includes(f)))fail('Supervisor approval required before section review',403);
          if(next.section_by&&next.section_by!==p.name)fail('Reviewer identity mismatch',403);
          return;
        }
        if(old.employee!==p.name||next.employee!==p.name||fields.some(f=>!['reason','from_date','to_date','duration','days','leave_type','short_start_time','short_end_time','short_minutes'].includes(f))||old.status!=='Pending')fail('Leave edit access denied',403);
        return;
      }
      if(t==='leave_report_coverage') {
        const a=this.rows('leave_applications').find(a=>a.id===target.application_id);
        if(a?.employee===p.name||m.includes('leave')&&['Supervisor','Section Incharge'].includes(this.role(p)))return;
        if(old?.assignee===p.name&&method!=='DELETE'&&fields.every(f=>['acceptance_status','responded_at','responded_by'].includes(f))&&next.responded_by===p.name&&['Accepted','Rejected'].includes(next.acceptance_status))return;
        fail('Coverage edit access denied',403);
      }
      fail('Write access denied',403);
    }
    data(p,b) {
      const t=b.table,method=b.method||'GET';if(!TABLES.includes(t)||!['GET','POST','PATCH','DELETE'].includes(method))fail('Unsupported data request');
      const q=query(b.query||'');
      if(q.on_conflict&&q.on_conflict!==KEYS[t].join(','))fail('Invalid conflict target');
      if(method==='GET') {
        let source=this.s.published?.tables||this.s.tables;
        if(b.namespace==='workhour'&&['p3','p6','p7'].includes(b.context))source=this.s.tables;
        if(t==='users'||t==='module_access'||b.editor&&p.is_admin||b.editor&&t==='done_state'&&q.username==='eq.'+p.name)source=this.s.tables;
        // Exact-key readbacks of the caller's own operational records are live.
        const exact=KEYS[t].every(f=>q[f]?.startsWith('eq.'));
        if(exact&&['tasks','task_remarks','task_completions','leave_applications','leave_report_coverage','done_state'].includes(t))source=this.s.tables;
        const rows=this.readRows(p,t,source,q,b);
        return select(rows,q);
      }
      if(t==='users')fail('Use account management');
      if(t==='work_hour_user_interface'&&method!=='GET')fail('Use atomic entry batch operation');
      if(['PATCH','DELETE'].includes(method)&&!keys(q).some(k=>!['select','order','limit','offset','on_conflict'].includes(k)))fail('A write filter is required');
      const table=this.rows(t),match=predicate(q),at=this.clock().iso;
      const batch=method==='POST'?(Array.isArray(b.body)?b.body:[b.body]):null;
      if(batch&&(!batch.length||batch.length>1000))fail('Send 1–1000 records');
      const operations=[];
      if(batch) {
        const seen=new Set();
        for(let row of batch) {
          if(!row||typeof row!=='object'||Array.isArray(row))fail('Invalid record');
          row=clone(row);
          if(KEYS[t].includes('id')&&!row.id)row.id=this.e.random();
          const k=key(t,row);if(seen.has(k))fail('Duplicate batch key');seen.add(k);
          const old=table.find(x=>key(t,x)===k);
          if(old&&!String(b.prefer||'').includes('resolution=merge-duplicates'))fail('Record already exists',409,'23505');
          const next=this.validate(t,{...old,...row});
          this.authorize(p,t,'POST',old,next);operations.push({old,next});
        }
      } else {
        for(const old of table.filter(match)) {
          if(t==='tasks'&&(!b.expected||b.expected[key(t,old)]!==old.updated_at))fail('Task changed. Reload before saving',409);

          const next=method==='PATCH'?this.validate(t,{...old,...clone(b.body)}):null;
          if(next&&KEYS[t].some(f=>!same(old[f],next[f])))fail('Record keys cannot change');
          this.authorize(p,t,method,old,next);operations.push({old,next});
        }
      }
      // All records are validated before mutating the in-memory transaction.
      const response=[];
      for(const {old,next} of operations) {
        if(next) {
          next.updated_at=new Date(Math.max(Date.parse(at),Date.parse(old?.updated_at||'1970-01-01')+1)).toISOString();if(!next.created_at)next.created_at=old?.created_at||at;
          if((t==='meta'||t==='app_state')&&next.key==='version')next.value=String(Number(old?.value||0)+1);
          if(old)table[table.indexOf(old)]=next;else table.push(next);
          response.push(clone(next));
        }else{table.splice(table.indexOf(old),1);response.push(clone(old));}
      }
      this.log(p.name,method+' '+t,{count:operations.length});
      return response;
    }
    publish(p,expected) {
      if(!p.is_admin)fail('Administrator access required',403);
      if((this.s.published?.version||null)!==(expected??null))fail('Reports changed. Reload first',409);
      this.s.previous=this.s.published;
      this.s.published={version:this.e.random(),publishedAt:this.clock().iso,tables:clone(this.s.tables)};
      // Passwords and credentials never appear in published tables.
      this.log(p.name,'PUBLISH',{version:this.s.published.version});
      return {version:this.s.published.version,publishedAt:this.s.published.publishedAt};
    }
    bootstrap(p) {
      const source=this.s.published?.tables||this.s.tables;
      const r=t=>this.readRows(p,t,source,{});
      const tasks=r('tasks').map(x=>({sl:x.sl,task:x.task,person:x.person||'',priority:x.priority,planDate:x.plan_date||'',planTime:x.plan_time||'',actualDate:x.actual_date||'',actualTime:x.actual_time||'',leadTime:x.lead_time||''}));
      const history=Object.fromEntries(r('task_completions').map(x=>[x.actual_date+':'+x.task_sl,{sl:x.task_sl,task:x.task,person:x.person,priority:x.priority,planDate:x.plan_date,planTime:x.plan_time,actualDate:x.actual_date,actualTime:x.actual_time,leadTime:x.lead_time}]));
      const apps=r('leave_applications').map(a=>{
        const coverage=r('leave_report_coverage').filter(c=>c.application_id===a.id);
        return {id:a.id,employee:a.employee,employeeRole:a.employee_role,leaveType:a.leave_type,duration:a.duration,fromDate:a.from_date,toDate:a.to_date,days:a.days,shortStartTime:a.short_start_time,shortEndTime:a.short_end_time,shortMinutes:a.short_minutes,reason:a.reason,supervisorStatus:a.supervisor_status,supervisorBy:a.supervisor_by,supervisorAt:a.supervisor_at,sectionStatus:a.section_status,sectionBy:a.section_by,sectionAt:a.section_at,status:a.status,balancingComplete:a.balancing_complete,appliedBy:a.applied_by,appliedAt:a.applied_at,balancedBy:a.balanced_by,balancedAt:a.balanced_at,reportAssignments:Object.fromEntries(coverage.map(c=>[String(c.task_sl),c.assignee])),reportAcceptance:Object.fromEntries(coverage.map(c=>[String(c.task_sl),{assignee:c.assignee,status:c.acceptance_status,respondedAt:c.responded_at,respondedBy:c.responded_by}]))};
      });
      return {taskRevisions:this.readRows(p,'tasks',source,{}).map(r=>({sl:r.sl,updated_at:r.updated_at})),user:{name:p.name,is_admin:p.is_admin},tasks,users:this.readRows(p,'users',this.s.tables,{}),doneState:Object.fromEntries(r('done_state').map(x=>[x.username,String(x.done_sls||'').split(',').filter(Boolean).map(Number)])),moduleAccess:Object.fromEntries(this.readRows(p,'module_access',this.s.tables,{}).map(x=>[x.username,String(x.modules||'').split(',').filter(Boolean)])),workingHours:Object.fromEntries(r('working_hours_defaults').map(x=>[x.person,x.minutes/60])),dailyWorkingHours:Object.fromEntries(r('working_hours_daily').map(x=>['workingHoursDaily:'+x.work_date+':'+encodeURIComponent(x.person),x.minutes])),taskCompletionHistory:history,taskRemarks:Object.fromEntries(r('task_remarks').map(x=>[x.remark_date+':'+x.task_sl,x.remark])),multiSkillMap:Object.fromEntries(r('multi_skill_assignments').map(x=>[String(x.task_sl),x.backup_person])),userJobRoles:Object.fromEntries(r('user_roles').map(x=>[x.username,x.role])),leaveApplications:apps,nextSl:Math.max(1,...this.rows('tasks').map(t=>Number(t.sl)+1)),version:this.s.published?.version||'initial'};
    }
    saveUsers(p,b) {
      if(!p.is_admin)fail('Administrator access required',403);
      if(!Array.isArray(b.rows)||!b.rows.length||b.rows.length>500)fail('Invalid account list');
      const seen=new Set(),next=[];
      for(const r of b.rows) {
        if(typeof r.name!=='string'||['__proto__','constructor','prototype'].includes(r.name)||!r.name.trim()||r.name.length>120||/[<>"'\x00-\x1f]/.test(r.name)||seen.has(r.name))fail('Invalid or duplicate account name');
        seen.add(r.name);
        const old=this.rows('users').find(u=>u.name===r.name);
        if(r.password)this.credential(r.name,r.password);
        if(!this.s.accounts[r.name])fail('Set a password for new account '+r.name);
        next.push({...old,name:r.name,id:old?.id||this.e.random(),role:old?.role||'user',active:old?.active!==false,color:/^#[a-f0-9]{6}$/i.test(r.color)?r.color:'#60a5fa'});
      }
      if(!next.some(u=>u.name===p.name&&u.role==='admin'))fail('Current administrator cannot be removed');
      for(const old of this.rows('users'))if(!seen.has(old.name)){delete this.s.accounts[old.name];delete this.s.whPermissions[old.name];for(const id of keys(this.s.sessions))if(this.s.sessions[id].name===old.name)delete this.s.sessions[id];}
      this.s.tables.module_access=this.rows('module_access').filter(r=>seen.has(r.username));
      this.s.tables.users=next;
      this.log(p.name,'SAVE_USERS',{count:next.length});return {ok:true};
    }
    whUsers(p) {
      if(!p.is_admin)fail('Administrator access required',403);
      return this.rows('users').map(u=>({id:u.id||u.name,user_name:u.name,email:u.email||'',department:u.department||'',section:u.section||'',designation:u.designation||'',office_id:u.office_id||'',active:u.active!==false,is_admin:u.role==='admin',permissions:clone(this.s.whPermissions[u.name]||{})}));
    }
    whSaveUser(p,b) {
      if(!p.is_admin)fail('Administrator access required',403);
      const old=b.id?this.rows('users').find(u=>u.id===b.id||u.name===b.id):null;
      if(b.id&&!old)fail('Account not found',404);
      if(old?.role==='admin')fail('Administrator profile is managed in the script editor');
      const name=old?.name||String(b.user_name||'').trim(),email=String(b.email||'').trim().toLowerCase();
      if(!name||['admin','__proto__','constructor','prototype'].includes(name)||/[<>"'\x00-\x1f]/.test(name)||!/^\S+@\S+\.\S+$/.test(email))fail('Valid account name and email required');
      if(old&&b.user_name!==old.name)fail('Renaming an existing account would break task ownership');
      if(this.rows('users').some(u=>u!==old&&(u.name===name||u.email===email)))fail('Account already exists',409);
      const permissions=clone(b.permissions||{}),scope=clone(b.entry_scope||{mode:'selected',rules:[]});
      if(!['all','selected'].includes(scope.mode)||!Array.isArray(scope.rules)||scope.rules.length>100)fail('Invalid entry scope');
      const cleaned={};
      for(const tab of ['p1','p2','p3','p4','p5','p6','p7']) {
        const v=permissions[tab]||{};cleaned[tab]={view:v.view===true,edit:v.view===true&&v.edit===true,delete:v.view===true&&v.delete===true,export:v.view===true&&v.export===true};
      }
      cleaned.p7.entry_scope=scope;
      if(b.password)this.credential(name,b.password);
      if(!this.s.accounts[name])fail('A password is required');
      const user={...old,id:old?.id||this.e.random(),name,email,role:old?.role||'user',active:b.active===true,department:String(b.department||''),section:String(b.section||''),designation:String(b.designation||''),office_id:String(b.office_id||''),color:old?.color||'#60a5fa'};
      if(old)this.s.tables.users[this.s.tables.users.indexOf(old)]=user;else this.s.tables.users.push(user);
      this.s.whPermissions[name]=cleaned;
      let access=this.rows('module_access').find(r=>r.username===name);
      if(!access){access={username:name,modules:''};this.s.tables.module_access.push(access);}
      const modules=String(access.modules||'').split(',').filter(Boolean);
      if(!modules.includes('workhourapproval'))modules.push('workhourapproval');access.modules=modules.join(',');
      this.log(p.name,'WORK_HOUR_USER',{name});
      return this.whUsers(p).find(u=>u.user_name===name);
    }
    applyEntries(p,b) {
      const entries=b.entries||[],deletions=b.deletions||[];
      if(!Array.isArray(entries)||!Array.isArray(deletions)||!entries.length&&!deletions.length||entries.length+deletions.length>200)fail('Send 1–200 changes');
      const seen=new Set(),table=this.rows('work_hour_user_interface'),now=this.clock().iso,ops=[];
      for(const item of entries) {
        if(!item.row?.id||seen.has(item.row.id))fail('Duplicate or missing entry ID');seen.add(item.row.id);
        const old=table.find(r=>r.id===item.row.id);
        if((old?.updated_at||null)!==(item.expected_updated_at||null))fail('Entry changed. Reload first',409);
        const row=this.validate('work_hour_user_interface',{...old,...clone(item.row)});
        this.authorize(p,'work_hour_user_interface',old?'PATCH':'POST',old,row);
        const logical=entryKey(row);
        if(table.some(r=>r.id!==row.id&&entryKey(r)===logical)||ops.some(o=>o.logical===logical))fail('Duplicate work-hour entry',409);
        // Present manpower is derived from punch records, never accepted from the client.
        row.present_manpower=this.rows('work_hour_daily_punch').filter(r=>r.work_date===row.work_date&&String(r.department||'').trim().toLowerCase()===String(row.department).trim().toLowerCase()&&String(r.section||'').trim().toLowerCase()===String(row.section).trim().toLowerCase()&&(!row.line_no||line(r.line)===line(row.line_no))).length;
        row.updated_at=new Date(Math.max(Date.parse(now),Date.parse(old?.updated_at||'1970-01-01')+1)).toISOString();row.updated_by=p.name;row.created_at=old?.created_at||now;ops.push({old,row,logical});
      }
      for(const item of deletions) {
        if(!item.id||seen.has(item.id))fail('Duplicate entry ID');seen.add(item.id);
        const old=table.find(r=>r.id===item.id);if(!old||old.updated_at!==item.expected_updated_at)fail('Entry changed. Reload first',409);
        this.authorize(p,'work_hour_user_interface','DELETE',old,null);ops.push({old,row:null});
      }
      for(const o of ops){if(o.old)table.splice(table.indexOf(o.old),1);if(o.row)table.push(o.row);}
      this.log(p.name,'WORK_HOUR_BATCH',{saved:entries.length,deleted:deletions.length});
      return {rows:ops.filter(o=>o.row).map(o=>clone(o.row)),deleted:deletions.map(d=>d.id)};
    }
    dispatch(b) {
      if(!b||typeof b!=='object')fail('Invalid request');
      if(b.op==='names')return this.rows('users').filter(u=>u.active!==false).map(({name,color})=>({name,color}));
      if(b.op==='login')return this.login(b);
      const p=this.profile(b.token);
      if(b.op==='logout'){delete this.s.sessions[this.e.hash(b.token)];return {};}
      if(b.op==='asset'){this.whProfile(p);if(!['portal','dashboard'].includes(b.name))fail('Unknown asset');return this.e.asset(b.name);}
      if(b.namespace==='workhour') {
        if(b.op==='me')return this.whProfile(p);
        if(b.op==='users')return this.whUsers(p);
        if(b.op==='save-user')return this.whSaveUser(p,b);
        if(b.op==='apply-entries'||b.op==='save-entries')return b.op==='save-entries'?this.applyEntries(p,b).rows:this.applyEntries(p,b);
      }
      if(b.op==='head'||b.op==='publication-head')return this.s.published?{version:this.s.published.version,publishedAt:this.s.published.publishedAt}:null;
      if(b.op==='publish'||b.op==='publish-reports')return this.publish(p,b.expectedVersion);
      if(b.op==='bootstrap')return this.bootstrap(p);
      if(b.op==='own-status')return clone(this.rows('tasks').filter(t=>own(p,t)));
      if(b.op==='replace-module-access'){
        if(!p.is_admin)fail('Administrator access required',403);
        if(!Array.isArray(b.rows)||b.rows.length>500)fail('Invalid module list');
        const seen=new Set(),allowed=['overview','kpi','all','plantime','workinghours','workhourapproval','leave'];
        const rows=b.rows.map(r=>{if(!this.rows('users').some(u=>u.name===r.username)||seen.has(r.username))fail('Invalid account');seen.add(r.username);const modules=String(r.modules||'').split(',').filter(Boolean);if(modules.some(m=>!allowed.includes(m)&&!['__role__:Supervisor','__role__:Section Incharge','__role__:Team Member'].includes(m)))fail('Invalid module');return {username:r.username,modules:modules.join(',')};});
        this.s.tables.module_access=rows;this.log(p.name,'MODULE_ACCESS',{count:rows.length});return {ok:true};
      }
      if(b.op==='save-users')return this.saveUsers(p,b);
      if(b.op==='data')return this.data(p,b);
      fail('Unsupported request');
    }
  }
  function empty(){return {schema:1,tables:Object.fromEntries(TABLES.map(t=>[t,[]])),accounts:{},sessions:{},rates:{},whPermissions:{},audit:[],published:null,previous:null};}
  return {Service,empty,query,select,date,TABLES,KEYS};
})();
