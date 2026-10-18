/** Apps Script entry points for the full dashboard. Setup helpers are private. */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Dashboard')
    .setTitle('DataCell Task Management — Google Sheets')
    .addMetaTag('viewport','width=device-width, initial-scale=1');
}
function sheetsHex_(bytes) { return bytes.map(b=>(b&255).toString(16).padStart(2,'0')).join(''); }
function sheetsHash_(text) {
  return sheetsHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text,Utilities.Charset.UTF_8));
}
function sheetsEnv_() {
  const pepper=PropertiesService.getScriptProperties().getProperty('DATACELL_PASSWORD_PEPPER');
  if(!pepper)throw Error('Storage is not configured');
  return {
    now:()=>Date.now(),
    clock:()=>({iso:new Date().toISOString(),date:Utilities.formatDate(new Date(),'Asia/Dhaka','yyyy-MM-dd'),time:Utilities.formatDate(new Date(),'Asia/Dhaka','HH:mm:ss')}),
    random:()=>Utilities.getUuid(),
    hash:sheetsHash_,
    mac:text=>sheetsHex_(Utilities.computeHmacSha256Signature(text,pepper,Utilities.Charset.UTF_8)),
    asset:name=>HtmlService.createHtmlOutputFromFile(name==='portal'?'WorkHourPortal':'WorkHourDashboard').getContent()
  };
}
function sheetsRead_(book) {
  const sheet=book.getSheetByName('Storage');
  if(!sheet)throw Error('Storage tab missing');
  const grid=sheet.getDataRange().getValues();
  if(JSON.stringify(grid[0].slice(0,4))!==JSON.stringify(['revision','sha256','part','json']))throw Error('Unexpected storage schema');
  const rows=grid.slice(1).filter(r=>r[0]!=='');
  if(!rows.length)throw Error('Storage is empty');
  const revision=Number(rows[0][0]),digest=String(rows[0][1]);
  rows.forEach((r,i)=>{if(Number(r[0])!==revision||String(r[1])!==digest||Number(r[2])!==i)throw Error('Storage integrity check failed');});
  const json=rows.map(r=>{const value=String(r[3]);if(!value.startsWith('json:'))throw Error('Invalid storage encoding');return value.slice(5);}).join('');
  if(sheetsHash_(json)!==digest)throw Error('Storage checksum mismatch');
  const state=JSON.parse(json);
  if(state.schema!==1)throw Error('Unsupported storage version');
  return {state,revision,sheet};
}
function sheetsWrite_(sheet,state,revision) {
  const text=JSON.stringify(state),digest=sheetsHash_(text),size=40000;
  const rows=[['revision','sha256','part','json']];
  for(let i=0;i<text.length;i+=size)rows.push([revision,digest,i/size,'json:'+text.slice(i,i+size)]);
  const old=sheet.getLastRow(),height=Math.max(old,rows.length);
  if(height>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),height-sheet.getMaxRows());
  while(rows.length<height)rows.push(['','','','']);
  // One range write commits the complete transaction, including audit and sessions.
  sheet.getRange(1,1,height,4).setValues(rows);
  SpreadsheetApp.flush();
}
function sheetsRequest(body) {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(30000))return {ok:false,error:'Database busy. Reload before retrying a change.',status:503};
  try {
    if(!body||JSON.stringify(body).length>3000000)throw Error('Request too large');
    const id=PropertiesService.getScriptProperties().getProperty('DATACELL_FULL_SHEET_ID');
    if(!id)throw Error('Administrator must run setupFullDashboard_ in the script editor first');
    const loaded=sheetsRead_(SpreadsheetApp.openById(id)),before=JSON.stringify(loaded.state);
    const state=JSON.parse(before),service=new DataCellSheets.Service(state,sheetsEnv_());
    let response;
    try {
      const data=service.dispatch(body);
      response={ok:true,data:data===undefined?null:JSON.parse(JSON.stringify(data))};
    } catch(error) {
      // Abort all operational changes on errors; retain only failed-login throttles.
      const rates=state.rates;
      Object.keys(state).forEach(k=>delete state[k]);Object.assign(state,JSON.parse(before));
      if(body.op==='login')state.rates=rates;
      response={ok:false,error:error.message||'Request failed',status:error.status||400,code:error.code||null};
    }
    if(JSON.stringify(state)!==before)sheetsWrite_(loaded.sheet,state,loaded.revision+1);
    return response;
  } catch(error) {
    return {ok:false,error:error.message||'Storage error. Reload before retrying a change.',status:500};
  } finally { lock.releaseLock(); }
}
/**
 * Run manually in the script editor, never from a browser.
 * Required Script Properties:
 * DATACELL_SOURCE_SHEET_ID = existing Fresh Database ID (read-only source).
 * DATACELL_INITIAL_ADMIN_PASSWORD = a unique password of at least 12 characters.
 * Optional DATACELL_EXPECTED_TASKS = source task count (default 93).
 * Creates a NEW private spreadsheet. Refuses to replace configured storage.
 */
function setupFullDashboard_() {
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try {
    const props=PropertiesService.getScriptProperties();
    if(props.getProperty('DATACELL_FULL_SHEET_ID'))throw Error('Already configured; refusing to replace storage');
    const sourceId=props.getProperty('DATACELL_SOURCE_SHEET_ID');
    const password=props.getProperty('DATACELL_INITIAL_ADMIN_PASSWORD');
    if(!sourceId||!password||password.length<12)throw Error('Set source Sheet ID and a unique administrator password of at least 12 characters');
    const book=SpreadsheetApp.openById(sourceId),tz=book.getSpreadsheetTimeZone(),backup={};
    book.getSheets().forEach(sh=>{
      const grid=sh.getDataRange().getValues();
      backup[sh.getName()]=JSON.parse(JSON.stringify(grid));
    });
    const read=name=>{
      const sh=book.getSheetByName(name);if(!sh)throw Error('Source tab missing: '+name);
      const grid=sh.getDataRange().getValues(),head=grid[0];
      return grid.slice(1).filter(r=>r.some(v=>v!=='')).map(r=>Object.fromEntries(head.map((k,i)=>{
        let v=r[i];
        if(Object.prototype.toString.call(v)==='[object Date]')v=['plan_date','work_date','from_date','to_date'].includes(k)?Utilities.formatDate(v,tz,'yyyy-MM-dd'):v.toISOString();
        return [k,v];
      })));
    };
    const users=read('users'),tasks=read('tasks');
    const expected=Number(props.getProperty('DATACELL_EXPECTED_TASKS')||93);
    if(!Number.isSafeInteger(expected)||expected<0||tasks.length!==expected)throw Error('Source task count changed. Review before migration');
    if(users.filter(u=>String(u.role).trim().toLowerCase()==='admin').length!==1)throw Error('Exactly one source administrator is required for initial mapping');
    if(new Set(tasks.map(t=>String(t.id))).size!==tasks.length||tasks.some(t=>!t.id||!t.title))throw Error('Duplicate or missing source task ID/title');
    const state=DataCellSheets.empty(),emailNames={};
    for(const u of users) {
      const role=String(u.role||'user').trim().toLowerCase();
      const name=role==='admin'?'admin':String(u.name||u.email).trim();
      if(!name||['__proto__','constructor','prototype'].includes(name)||/[<>"'\x00-\x1f]/.test(name)||state.tables.users.some(v=>v.name===name))throw Error('Source account names need an explicit mapping');
      const email=String(u.email||'').trim().toLowerCase();
      if(!email||emailNames[email])throw Error('Invalid or duplicate source email');
      emailNames[email]=name;
      state.tables.users.push({id:Utilities.getUuid(),name,email,display_name:u.name,role,active:String(u.active).toLowerCase()==='true',department:u.department||'',color:role==='admin'?'#f5c842':'#60a5fa',source_record:u});
      state.tables.module_access.push({username:name,modules:''});
    }
    state.tables.tasks=tasks.map((t,i)=>{
      const legacy=/^legacy-(\d+)$/.exec(String(t.id)),sl=legacy?Number(legacy[1]):i+1;
      if(t.assignee_email&&!emailNames[String(t.assignee_email).toLowerCase().trim()])throw Error('A task assignee is absent from the source users');
      const completed=t.status==='Done'&&t.completed_at?new Date(t.completed_at):null;
      return {sl,task:String(t.title),person:t.assignee_email?emailNames[String(t.assignee_email).toLowerCase().trim()]:'',priority:String(t.priority).toLowerCase()==='high',plan_date:t.plan_date||'',plan_time:'',actual_date:completed?Utilities.formatDate(completed,tz,'yyyy-MM-dd'):'',actual_time:completed?Utilities.formatDate(completed,tz,'HH:mm'):'',lead_time:Number(t.plan_minutes)>0?String(t.plan_minutes)+'min':'',source_id:String(t.id),source_record:t,created_at:t.created_at||new Date().toISOString(),updated_at:t.updated_at||new Date().toISOString()};
    });
    if(new Set(state.tables.tasks.map(t=>t.sl)).size!==tasks.length)throw Error('Task number collision; explicit mapping required');
    const wh=read('work_hours'),leave=read('leave_requests');
    // Preserve every source row in the private backup and in each mapped record.
    state.sourceBackup={spreadsheetId:sourceId,timeZone:tz,capturedAt:new Date().toISOString(),sheets:backup};
    for(const w of wh)if(String(w.status)==='Approved'&&emailNames[String(w.employee_email).toLowerCase()]) {
      const person=emailNames[String(w.employee_email).toLowerCase()],existing=state.tables.working_hours_daily.find(r=>r.person===person&&r.work_date===w.work_date);
      if(existing)existing.minutes+=Number(w.minutes)||0;else state.tables.working_hours_daily.push({person,work_date:w.work_date,minutes:Number(w.minutes)||0});
    }
    state.sourceWorkHourRequests=wh;
    state.tables.leave_applications=leave.map(l=>({id:String(l.id),employee:emailNames[String(l.employee_email).toLowerCase()]||String(l.employee_email),leave_type:l.type||'Casual',duration:'single',from_date:l.from_date,to_date:l.to_date,days:Math.floor((Date.parse(l.to_date)-Date.parse(l.from_date))/86400000)+1,reason:l.reason||'',status:l.status||'Pending',supervisor_status:'Pending',section_status:'Pending',balancing_complete:false,applied_by:emailNames[String(l.employee_email).toLowerCase()]||String(l.employee_email),applied_at:l.created_at||new Date().toISOString(),source_record:l}));
    state.tables.work_hour_approval_state=[{id:'main',rows:[],report_date:'',created_at:new Date().toISOString(),updated_at:new Date().toISOString()}];
    props.setProperty('DATACELL_PASSWORD_PEPPER',Utilities.getUuid()+Utilities.getUuid());
    const service=new DataCellSheets.Service(state,sheetsEnv_());
    state.tables.users.forEach(u=>service.credential(u.name,u.role==='admin'?password:Utilities.getUuid()+Utilities.getUuid()));
    service.publish({name:'admin',is_admin:true},null);
    const dest=SpreadsheetApp.create('DataCell — Full Dashboard Google Sheets');
    const storage=dest.getSheets()[0];storage.setName('Storage');
    sheetsWrite_(storage,state,1);
    const verified=sheetsRead_(dest);
    if(verified.state.tables.tasks.length!==tasks.length||verified.state.tables.users.length!==users.length)throw Error('Migration verification failed; storage was not activated');
    props.setProperty('DATACELL_FULL_SHEET_ID',dest.getId());
    props.deleteProperty('DATACELL_INITIAL_ADMIN_PASSWORD');
    return {url:dest.getUrl(),tasks:tasks.length,users:users.length,sourceUnchanged:true};
  } finally { lock.releaseLock(); }
}

/** Owner-only password recovery: set DATACELL_INITIAL_ADMIN_PASSWORD, then run here. */
function resetFullDashboardAdminPassword_(){const lock=LockService.getScriptLock();lock.waitLock(30000);try{const props=PropertiesService.getScriptProperties(),password=props.getProperty('DATACELL_INITIAL_ADMIN_PASSWORD'),id=props.getProperty('DATACELL_FULL_SHEET_ID');if(!id||!password||password.length<12)throw Error('Set the administrator reset password (12+ characters) in Script Properties');const loaded=sheetsRead_(SpreadsheetApp.openById(id)),service=new DataCellSheets.Service(loaded.state,sheetsEnv_());service.credential('admin',password);service.log('script-owner','ADMIN_PASSWORD_RESET',{});sheetsWrite_(loaded.sheet,loaded.state,loaded.revision+1);props.deleteProperty('DATACELL_INITIAL_ADMIN_PASSWORD');return {ok:true};}finally{lock.releaseLock();}}
