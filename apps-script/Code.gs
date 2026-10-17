/** DataCell Fresh: standalone Google Sheets + Apps Script. Run setupFreshDatacell once. */
const DC = {
  tasks:['id','title','description','assignee_email','department','priority','plan_date','plan_minutes','status','actual_minutes','completed_at','created_at','created_by','updated_at','version'],
  users:['email','name','role','active','department','created_at'],
  work_hours:['id','employee_email','work_date','minutes','note','status','reviewed_by','reviewed_at','created_at'],
  leave_requests:['id','employee_email','from_date','to_date','type','reason','status','reviewed_by','reviewed_at','created_at'],
  audit:['at','actor','action','record_type','record_id','details'],
  settings:['key','value']
};
function now_(){return new Date().toISOString()}
function props_(){return PropertiesService.getScriptProperties()}
function sheet_(name){const id=props_().getProperty('DATACELL_SHEET_ID');if(!id)throw Error('Run setupFreshDatacell first');const s=SpreadsheetApp.openById(id).getSheetByName(name);if(!s)throw Error('Missing sheet: '+name);return s}
function rows_(name){const a=sheet_(name).getDataRange().getValues();if(a.length<2)return [];return a.slice(1).filter(r=>r.some(v=>v!=='' )).map((r,i)=>Object.fromEntries(a[0].map((key,j)=>[key,r[j]])))}
function auth_(){const email=String(Session.getActiveUser().getEmail()||'').toLowerCase().trim();if(!email)throw Error('Google account identity unavailable. Use a domain-restricted deployment and test first.');const u=rows_('users').find(r=>String(r.email).toLowerCase()===email&&String(r.active).toLowerCase()==='true');if(!u)throw Error('Your Google account is not authorized: '+email);return {email,role:String(u.role).toLowerCase(),department:String(u.department||''),name:String(u.name||'')}}
function admin_(){const u=auth_();if(u.role!=='admin')throw Error('Admin permission required');return u}
function safe_(v){if(v===undefined||v===null)return '';if(typeof v==='string'&&/^[=+\-@\t\r]/.test(v))return "'"+v;return v}
function store_(table,obj){sheet_(table).appendRow(DC[table].map(k=>safe_(obj[k])))}
function log_(u,action,table,id,details){store_('audit',{at:now_(),actor:u.email,action,record_type:table,record_id:id,details:JSON.stringify(details||{})})}
function locked_(f){const lock=LockService.getScriptLock();if(!lock.tryLock(20000))throw Error('Busy, retry');try{return f()}finally{lock.releaseLock()}}
function setupFreshDatacell(){const p=props_();if(p.getProperty('DATACELL_SHEET_ID'))throw Error('Already configured. New setup refused');const email=String(Session.getEffectiveUser().getEmail()||'').toLowerCase().trim();if(!email)throw Error('Owner email unavailable');const book=SpreadsheetApp.create('DataCell - Fresh Database');Object.keys(DC).forEach(name=>{const sh=book.insertSheet(name);sh.getRange(1,1,1,DC[name].length).setValues([DC[name]]);sh.setFrozenRows(1);sh.getRange(1,1,1,DC[name].length).setFontWeight('bold')});const blank=book.getSheetByName('Sheet1');if(blank)book.deleteSheet(blank);p.setProperty('DATACELL_SHEET_ID',book.getId());store_('users',{email,name:'Administrator',role:'admin',active:true,department:'All',created_at:now_()});store_('settings',{key:'created_at',value:now_()});return {url:book.getUrl(),owner:email}}
function doGet(){auth_();return HtmlService.createHtmlOutputFromFile('Index').setTitle('DataCell Task Management')}
function bootstrap() {
  const user = auth_();
  const timeZone = sheet_('tasks').getParent().getSpreadsheetTimeZone();
  const payload = {
    user,
    tasks: visible_(user, rows_('tasks')),
    users: user.role === 'admin'
      ? rows_('users').map(({email, name, role, active, department}) =>
          ({email, name, role, active, department}))
      : [],
    workHours: visibleRequests_(user, 'work_hours'),
    leave: visibleRequests_(user, 'leave_requests')
  };
  ['tasks', 'workHours', 'leave'].forEach(key => {
    payload[key] = payload[key].map(row => {
      const copy = {...row};
      ['plan_date', 'work_date', 'from_date', 'to_date'].forEach(field => {
        const value = copy[field];
        if (Object.prototype.toString.call(value) === '[object Date]') {
          if (!Number.isFinite(value.getTime())) throw Error('Invalid date in ' + key);
          copy[field] = Utilities.formatDate(value, timeZone, 'yyyy-MM-dd');
        }
      });
      return copy;
    });
  });
  return JSON.parse(JSON.stringify(payload));
}
function visible_(u,arr){return u.role==='admin'?arr:arr.filter(r=>String(r.assignee_email).toLowerCase()===u.email)}
function visibleRequests_(u,type){return u.role==='admin'?rows_(type):rows_(type).filter(r=>String(r.employee_email).toLowerCase()===u.email)}
function validateEmail_(v){v=String(v||'').toLowerCase().trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))throw Error('Valid email required');return v}
function addUser(form){const a=admin_();const email=validateEmail_(form.email);const role=String(form.role||'user').toLowerCase();if(!['admin','user','manager'].includes(role))throw Error('Invalid role');return locked_(()=>{if(rows_('users').some(x=>String(x.email).toLowerCase()===email))throw Error('Account exists');store_('users',{email,name:String(form.name||'').trim().slice(0,120),role,active:true,department:String(form.department||'').slice(0,100),created_at:now_()});log_(a,'CREATE','users',email);return {ok:true}})}
function createTask(form){const a=admin_();const title=String(form.title||'').trim();if(!title||title.length>250)throw Error('Task title required, max 250 chars');const assignee=validateEmail_(form.assignee_email);return locked_(()=>{if(!rows_('users').some(x=>String(x.email).toLowerCase()===assignee&&String(x.active).toLowerCase()==='true'))throw Error('Assignee not active');const id=Utilities.getUuid();store_('tasks',{id,title,description:String(form.description||'').slice(0,2000),assignee_email:assignee,department:String(form.department||'').slice(0,100),priority:taskPriority_(form.priority),plan_date:calendarDate_(form.plan_date,'plan date',true),plan_minutes:planMinutes_(form.plan_minutes),status:'Pending',actual_minutes:0,completed_at:'',created_at:now_(),created_by:a.email,updated_at:now_(),version:1});log_(a,'CREATE','tasks',id);return {ok:true,id}})}
function completeTask(id,actualMinutes,expectedVersion){const u=auth_();const minutes=Number(actualMinutes);if(!Number.isFinite(minutes)||minutes<0||minutes>100000)throw Error('Invalid actual minutes');return locked_(()=>{const sh=sheet_('tasks'),grid=sh.getDataRange().getValues(),h=grid[0],ix=h.indexOf('id'),i=grid.findIndex((r,j)=>j>0&&String(r[ix])===String(id));if(i<0)throw Error('Task not found');const obj=Object.fromEntries(h.map((k,j)=>[k,grid[i][j]]));if(u.role!=='admin'&&String(obj.assignee_email).toLowerCase()!==u.email)throw Error('Not your task');if(String(obj.status)==='Done')throw Error('Already done');if(Number(obj.version)!==Number(expectedVersion))throw Error('Task changed; refresh');const values={status:'Done',actual_minutes:minutes,completed_at:now_(),updated_at:now_(),version:Number(obj.version)+1};Object.entries(values).forEach(([key,val])=>sh.getRange(i+1,h.indexOf(key)+1).setValue(val));log_(u,'COMPLETE','tasks',id,{minutes});return {ok:true}})}
function submitWorkHours(form){const u=auth_(),minutes=Number(form.minutes);const workDate=calendarDate_(form.work_date,'work date');if(!Number.isFinite(minutes)||minutes<=0||minutes>1440)throw Error('Minutes must be 1–1440');return locked_(()=>{const id=Utilities.getUuid();store_('work_hours',{id,employee_email:u.email,work_date:workDate,minutes,note:String(form.note||'').slice(0,1000),status:'Pending',created_at:now_()});log_(u,'CREATE','work_hours',id);return {ok:true}})}
function submitLeave(form){const u=auth_();const fromDate=calendarDate_(form.from_date,'leave start date'),toDate=calendarDate_(form.to_date,'leave end date');if(toDate<fromDate)throw Error('Invalid leave dates');return locked_(()=>{const id=Utilities.getUuid();store_('leave_requests',{id,employee_email:u.email,from_date:fromDate,to_date:toDate,type:String(form.type||'Casual').slice(0,50),reason:String(form.reason||'').slice(0,1000),status:'Pending',created_at:now_()});log_(u,'CREATE','leave_requests',id);return {ok:true}})}
function reviewRequest(table,id,decision){const u=admin_();if(!['work_hours','leave_requests'].includes(table)||!['Approved','Rejected'].includes(decision))throw Error('Invalid request');return locked_(()=>{const sh=sheet_(table),grid=sh.getDataRange().getValues(),h=grid[0],ix=h.indexOf('id'),i=grid.findIndex((r,j)=>j>0&&String(r[ix])===String(id));if(i<0)throw Error('Not found');if(String(grid[i][h.indexOf('status')])!=='Pending')throw Error('Already reviewed');[['status',decision],['reviewed_by',u.email],['reviewed_at',now_()]].forEach(([k,v])=>sh.getRange(i+1,h.indexOf(k)+1).setValue(v));log_(u,'REVIEW',table,id,{decision});return {ok:true}})}


/**
 * Optional one-way import from existing "DataCell Migration - STAGING".
 * Source spreadsheet is NEVER changed.
 * Set LEGACY_STAGING_SHEET_ID in Script Properties manually.
 * Run only after setupFreshDatacell(), before creating new tasks.
 */
function importExisting93Tasks(){
  const admin=admin_();
  return locked_(()=>{
    const sourceId=props_().getProperty('LEGACY_STAGING_SHEET_ID');
    if(!sourceId)throw Error('Set LEGACY_STAGING_SHEET_ID in Script Properties first.');
    if(sourceId===props_().getProperty('DATACELL_SHEET_ID'))throw Error('Source and destination must be different.');
    const dest=sheet_('tasks');
    if(dest.getLastRow()>1)throw Error('Destination task sheet is not empty; refusing import.');
    const src=SpreadsheetApp.openById(sourceId).getSheetByName('tasks');
    if(!src)throw Error('Source tasks sheet missing.');
    const grid=src.getDataRange().getDisplayValues();
    const head=grid.shift().map(x=>String(x).trim());
    const mandatory=['sl','task','person','priority','plan_date','plan_time','actual_date','actual_time','lead_time'];
    if(mandatory.some(k=>!head.includes(k)))throw Error('Unexpected source headers.');
    const records=grid.filter(r=>r.some(v=>String(v).trim()!=='')).map(r=>Object.fromEntries(head.map((k,i)=>[k,r[i]])));
    const ids=records.map(r=>String(r.sl).trim());
    if(new Set(ids).size!==ids.length||ids.some(x=>!x))throw Error('Duplicate/blank task IDs.');
    if(records.some(r=>!String(r.task).trim()))throw Error('Blank title in source.');
    const now=now_();
    const out=records.map(r=>{
      const id='legacy-'+r.sl, title=String(r.task).trim();
      const description='Legacy SL: '+r.sl+
        '\\nOriginal person: '+String(r.person||'')+
        '\\nOriginal plan time: '+String(r.plan_time||'')+
        '\\nOriginal actual date/time: '+String(r.actual_date||'')+' '+String(r.actual_time||'')+
        '\\nOriginal lead time: '+String(r.lead_time||'');
      const obj={
        id, title, description, assignee_email:'', department:'',
        priority:String(r.priority).toLowerCase()==='true'?'High':'Normal',
        plan_date:/^\d{4}-\d{2}-\d{2}$/.test(String(r.plan_date))?r.plan_date:'',
        plan_minutes:0,status:'Pending',actual_minutes:0,completed_at:'',
        created_at:now,created_by:admin.email,updated_at:now,version:1
      };
      return DC.tasks.map(k=>safe_(obj[k]));
    });
    if(out.length){dest.getRange(2,1,out.length,DC.tasks.length).setValues(out);SpreadsheetApp.flush();}
    if(dest.getLastRow()-1!==records.length)throw Error('Count mismatch. Inspect staging.');
    log_(admin,'LEGACY_IMPORT','tasks','batch',{count:records.length,source:'legacy staging'});
    return {ok:true,imported:records.length,unassigned:records.length};
  });
}
/** Admin assigns imported task to a provisioned Google user. */
function assignTask(id,email,expectedVersion){
  const admin=admin_();
  const assignee=validateEmail_(email);
  return locked_(()=>{
    if(!rows_('users').some(u=>String(u.email).toLowerCase()===assignee&&String(u.active).toLowerCase()==='true'))
      throw Error('Add/activate user first.');
    const sh=sheet_('tasks'),all=sh.getDataRange().getValues(),h=all[0];
    const row=all.findIndex((r,i)=>i>0&&String(r[h.indexOf('id')])===String(id));
    if(row<1)throw Error('Task not found.');
    if(Number(all[row][h.indexOf('version')])!==Number(expectedVersion))throw Error('Task changed, refresh.');
    for(const [k,v] of Object.entries({assignee_email:assignee,updated_at:now_(),version:Number(expectedVersion)+1}))
      sh.getRange(row+1,h.indexOf(k)+1).setValue(v);
    log_(admin,'ASSIGN','tasks',id,{assignee});
    return {ok:true};
  });
}



/** Validates new inputs only; does not rewrite existing records. */
function calendarDate_(value, label, optional) {
  const text = String(value || '').trim();
  if (optional && !text) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw Error('Invalid ' + label);
  const parsed = new Date(text + 'T00:00:00.000Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text)
    throw Error('Invalid ' + label);
  return text;
}
function planMinutes_(value) {
  const minutes = Number(value === undefined || value === null || value === '' ? 0 : value);
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 100000)
    throw Error('Plan minutes must be between 0 and 100000');
  return minutes;
}
function taskPriority_(value) {
  const priority = String(value || 'Normal');
  if (!['Normal', 'High', 'Low'].includes(priority)) throw Error('Invalid priority');
  return priority;
}
