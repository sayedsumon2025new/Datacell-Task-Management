const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const fixedGs = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
const fixedHtml = fs.readFileSync(path.join(__dirname, '..', 'Index.html'), 'utf8');

let passes=0;
function test(name,fn){fn();passes++;console.log('PASS '+name)}
const taskHeaders=['id','title','description','assignee_email','department','priority','plan_date','plan_minutes','status','actual_minutes','completed_at','created_at','created_by','updated_at','version'];
const userHeaders=['email','name','role','active','department','created_at'];
let account='admin@example.com',writes=0,lockHeld=false;
const sheets={
tasks:[taskHeaders,...Array.from({length:93},(_,i)=>['legacy-'+(i+1),i===0?'<img src=x onerror=alert(1)>':'Task '+i,'',i===0?'user@example.com':'','','High',new Date('2026-10-16T18:00:00Z'),10,'Pending',0,'',new Date('2026-10-17T12:00:00Z'),'admin@example.com','',1])],
users:[userHeaders,['admin@example.com','Admin','admin',true,'All',new Date('2026-10-17T00:00:00Z')],['user@example.com','User','user',true,'A',''],['inactive@example.com','Inactive','user',false,'A','']],
work_hours:[['id','employee_email','work_date','minutes','status'],['w1','user@example.com',new Date('2026-10-16T18:00:00Z'),30,'Pending']],
leave_requests:[['id','employee_email','from_date','to_date','type','status'],['l1','admin@example.com',new Date('2026-10-16T18:00:00Z'),new Date('2026-10-17T18:00:00Z'),'Casual','Pending']],
audit:[['at','actor','action','record_type','record_id','details']],settings:[['key','value']]};
const sheet=name=>({
getDataRange:()=>({getValues:()=>sheets[name].map(r=>r.slice())}),
getLastRow:()=>sheets[name].length,
getParent:()=>({getSpreadsheetTimeZone:()=> 'Asia/Dhaka'}),
getRange:(row,col)=>({setValue:value=>{writes++;sheets[name][row-1][col-1]=value}}),
appendRow:r=>{writes++;sheets[name].push(r)}
});
const backend=vm.createContext({
Session:{getActiveUser:()=>({getEmail:()=>account})},
PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='DATACELL_SHEET_ID'?'existing-database':k==='LEGACY_STAGING_SHEET_ID'?'staging':null})},
SpreadsheetApp:{openById:()=>({getSheetByName:name=>sheet(name)})},
Utilities:{getUuid:()=> 'fixture-new-id',formatDate:(date,tz)=> new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(date)},
LockService:{getScriptLock:()=>({tryLock:()=>{lockHeld=true;return true},releaseLock:()=>{lockHeld=false}})}
});
vm.runInContext(fixedGs,backend);
const baseline=JSON.stringify(sheets);
let adminPayload;
test('Admin bootstrap includes 93 tasks and 3 users',()=>{adminPayload=backend.bootstrap();assert.equal(adminPayload.tasks.length,93);assert.equal(adminPayload.users.length,3)});
test('Calendar dates retain Asia/Dhaka date',()=>{assert.equal(adminPayload.tasks[0].plan_date,'2026-10-17');assert.equal(adminPayload.workHours[0].work_date,'2026-10-17');assert.equal(adminPayload.leave[0].to_date,'2026-10-18')});
test('Timestamps are serializable strings',()=>assert.equal(adminPayload.tasks[0].created_at,'2026-10-17T12:00:00.000Z'));
test('Bootstrap has no Date objects anywhere',()=>{function visit(x){if(!x||typeof x!=='object')return;assert.notEqual(Object.prototype.toString.call(x),'[object Date]');Object.values(x).forEach(visit)}visit(adminPayload)});
test('Bootstrap writes no data',()=>{assert.equal(JSON.stringify(sheets),baseline);assert.equal(writes,0)});
test('User gets only own task, no user directory',()=>{account='user@example.com';const p=backend.bootstrap();assert.equal(p.tasks.length,1);assert.equal(p.users.length,0);assert.equal(p.leave.length,0);assert.equal(p.workHours.length,1)});
test('Blank identity denied without owner fallback',()=>{account='';assert.throws(()=>backend.bootstrap(),/identity unavailable/)});
test('Unknown account denied',()=>{account='unknown@example.com';assert.throws(()=>backend.bootstrap(),/not authorized/)});
test('Inactive account denied',()=>{account='inactive@example.com';assert.throws(()=>backend.bootstrap(),/not authorized/)});
test('Non-admin assignment denied',()=>{account='user@example.com';assert.throws(()=>backend.assignTask('legacy-2',account,1),/Admin permission required/)});
test('Non-admin user creation denied',()=>assert.throws(()=>backend.addUser({email:'new@example.com'}),/Admin permission required/));
test('Non-admin task creation denied',()=>assert.throws(()=>backend.createTask({}),/Admin permission required/));
test('Non-admin review denied',()=>assert.throws(()=>backend.reviewRequest('work_hours','w1','Approved'),/Admin permission required/));
test('Cross-user completion denied',()=>assert.throws(()=>backend.completeTask('legacy-2',10,1),/Not your task/));
test('Stale completion denied',()=>assert.throws(()=>backend.completeTask('legacy-1',10,2),/Task changed/));
test('Negative completion minutes denied',()=>assert.throws(()=>backend.completeTask('legacy-1',-1,1),/Invalid actual minutes/));
test('Existing setup cannot create replacement database',()=>assert.throws(()=>backend.setupFreshDatacell(),/Already configured/));
test('Re-import into populated task sheet denied',()=>{account='admin@example.com';assert.throws(()=>backend.importExisting93Tasks(),/not empty/)});
test('Assignment to inactive user denied',()=>assert.throws(()=>backend.assignTask('legacy-2','inactive@example.com',1),/activate user/));
test('Stale assignment denied',()=>assert.throws(()=>backend.assignTask('legacy-2','user@example.com',2),/Task changed/));
test('Rejected operations preserve all records',()=>{assert.equal(JSON.stringify(sheets),baseline);assert.equal(writes,0)});
test('Admin assignment updates only selected task and audit',()=>{assert.equal(backend.assignTask('legacy-2','user@example.com',1).ok,true);assert.equal(sheets.tasks[2][3],'user@example.com');assert.equal(sheets.tasks[2][14],2);assert.equal(sheets.tasks.length,94);assert.equal(JSON.stringify(sheets.users),JSON.parse(baseline).users?JSON.stringify(JSON.parse(baseline).users):'');assert.equal(sheets.audit.length,2);assert.equal(lockHeld,false)});
function ui(googleAvailable=true){
const elements={};let pending=[],timers=new Map(),timerId=0;
function element(id){return elements[id]||=( {id,textContent:'',innerHTML:'',className:'',disabled:false,querySelectorAll:()=>[],after(other){elements[other.id]=other},remove(){delete elements[this.id]}})}
['who','notice','nav','view'].forEach(element);
const document={querySelector:s=>element(s.slice(1)),getElementById:id=>elements[id]||null,querySelectorAll:()=>[],createElement:()=>element('temporary')};
let success,failure;
const runner=new Proxy({withSuccessHandler:fn=>{success=fn;return runner},withFailureHandler:fn=>{failure=fn;return runner}}, {get(target,key){return key in target?target[key]:(...args)=>pending.push({fn:key,args,success,failure})}});
const google={script:{run:runner}};
const ctx=vm.createContext({document,google:googleAvailable?google:undefined,window:{google:googleAvailable?google:undefined},setTimeout:fn=>{timers.set(++timerId,fn);return timerId},clearTimeout:id=>timers.delete(id),prompt:()=>null,confirm:()=>false,console});
vm.runInContext(fixedHtml.match(/<script>([\s\S]*?)<\/script>/)[1],ctx);
return {ctx,elements,pending,timers};
}
test('Initial UI makes exactly one bootstrap request',()=>{const u=ui();assert.equal(u.pending.length,1);assert.equal(u.pending[0].fn,'bootstrap');assert.equal(u.elements.notice.textContent,'Working…')});
test('Null bootstrap becomes visible error with reload',()=>{const u=ui();u.pending[0].success(null);assert.match(u.elements.notice.textContent,/Invalid account response/);assert.equal(u.elements.who.textContent,'Unable to load account');assert(u.elements.retryLoad);assert.equal(vm.runInContext('state',u.ctx),null)});
test('Null user rejected before state assignment',()=>{const u=ui();u.pending[0].success({...adminPayload,user:null});assert.equal(vm.runInContext('state',u.ctx),null);assert.equal(u.elements.notice.className,'error')});
test('Malformed task array rejected',()=>{const u=ui();u.pending[0].success({...adminPayload,tasks:[null]});assert.match(u.elements.notice.textContent,/Invalid database response/)});
test('Admin dashboard renders 93 tasks and Users tab',()=>{const u=ui();u.pending[0].success(adminPayload);assert.match(u.elements.view.innerHTML,/>93</);assert.match(u.elements.nav.innerHTML,/data-tab="Users"/);assert.equal(u.elements.notice.className,'muted')});
test('Task list renders escaped titles and assignment controls',()=>{const u=ui();u.pending[0].success(adminPayload);vm.runInContext("tab='Tasks';draw()",u.ctx);assert.match(u.elements.view.innerHTML,/data-assign="legacy-1"/);assert.match(u.elements.view.innerHTML,/&lt;img/);assert(!u.elements.view.innerHTML.includes('<img src=x'))});
test('User cannot render Users tab or assignment controls',()=>{account='user@example.com';const payload=backend.bootstrap();const u=ui();u.pending[0].success(payload);vm.runInContext("tab='Users';draw()",u.ctx);assert.equal(vm.runInContext('tab',u.ctx),'Dashboard');vm.runInContext("tab='Tasks';draw()",u.ctx);assert(!u.elements.view.innerHTML.includes('data-assign'));assert(!u.elements.nav.innerHTML.includes('data-tab="Users"'))});
test('Server failure displays error and ends loading',()=>{const u=ui();u.pending[0].failure({message:'Account not authorized'});assert.equal(u.elements.notice.textContent,'Account not authorized');assert.equal(u.elements.who.textContent,'Unable to load account');assert.equal(vm.runInContext('busy',u.ctx),false)});
test('Retry clears error style and renders dashboard',()=>{const u=ui();u.pending[0].failure({message:'Transient failure'});u.elements.retryLoad.onclick();u.pending[1].success(adminPayload);assert.equal(u.elements.notice.className,'muted');assert(!u.elements.retryLoad);assert.match(u.elements.view.innerHTML,/>93</)});
test('Missing Apps Script bridge produces helpful error',()=>{const u=ui(false);assert.match(u.elements.notice.textContent,/Web App URL/);assert.equal(vm.runInContext('busy',u.ctx),false)});
test('Overlapping requests suppressed',()=>{const u=ui();vm.runInContext('reload()',u.ctx);assert.equal(u.pending.length,1)});
test('Timeout stops loading and ignores late callbacks',()=>{const u=ui();[...u.timers.values()][0]();assert.match(u.elements.notice.textContent,/timed out/);u.pending[0].success(adminPayload);assert.equal(vm.runInContext('state',u.ctx),null)});
test('Render exceptions become visible errors',()=>{const u=ui();vm.runInContext("dashboard=()=>{throw Error('Render failed')}",u.ctx);u.pending[0].success(adminPayload);assert.equal(u.elements.notice.textContent,'Render failed');assert.equal(vm.runInContext('state',u.ctx),null)});
test('draw before bootstrap does not crash',()=>{const u=ui();assert.doesNotThrow(()=>vm.runInContext('draw()',u.ctx))});

test('Invalid plan minutes rejected before any write',()=>{account='admin@example.com';const before=writes;for(const value of [Infinity,-1,'not-a-number',100001])assert.throws(()=>backend.createTask({title:'Test',assignee_email:'user@example.com',plan_minutes:value}),/Plan minutes/);assert.equal(writes,before)});
test('Invalid task priority rejected before any write',()=>{const before=writes;assert.throws(()=>backend.createTask({title:'Test',assignee_email:'user@example.com',priority:'Urgent'}),/Invalid priority/);assert.equal(writes,before)});
test('Impossible plan date rejected before any write',()=>{const before=writes;assert.throws(()=>backend.createTask({title:'Test',assignee_email:'user@example.com',plan_date:'2026-02-30'}),/Invalid plan date/);assert.equal(writes,before)});
test('Impossible work date rejected before any write',()=>{const before=writes;assert.throws(()=>backend.submitWorkHours({work_date:'2026-02-30',minutes:30}),/Invalid work date/);assert.equal(writes,before)});
test('Impossible leave date rejected before any write',()=>{const before=writes;assert.throws(()=>backend.submitLeave({from_date:'2026-02-30',to_date:'2026-03-02'}),/Invalid leave start date/);assert.equal(writes,before)});
test('Leap day and optional date validated correctly',()=>{assert.equal(backend.calendarDate_('2028-02-29','date'),'2028-02-29');assert.throws(()=>backend.calendarDate_('2026-02-29','date'),/Invalid date/);assert.equal(backend.calendarDate_('','date',true),'')});
console.log('TOTAL '+passes+' tests passed. Node VM and DOM/Google mocks; no live deployment tests.');

