const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.join(__dirname,'..');
const core=fs.readFileSync(path.join(root,'Core.gs'),'utf8'),glue=fs.readFileSync(path.join(root,'Code.gs'),'utf8');
const fixed=Date.parse('2026-10-18T09:00:00.000Z');
class Clock extends Date{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}}
const C={
tasks:['id','title','description','assignee_email','department','priority','plan_date','plan_minutes','status','actual_minutes','completed_at','created_at','created_by','updated_at','version'],
users:['email','name','role','active','department','created_at'],
work_hours:['id','employee_email','work_date','minutes','note','status','reviewed_by','reviewed_at','created_at'],
leave_requests:['id','employee_email','from_date','to_date','type','reason','status','reviewed_by','reviewed_at','created_at']};
class Sheet {
 constructor(book,name,grid=[]){this.book=book;this.name=name;this.grid=grid.map(r=>r.slice());this.max=1000;}
 getName(){return this.name;}setName(name){this.name=name;return this;}getParent(){return this.book;}
 getMaxRows(){return this.max;}insertRowsAfter(n,count){this.max+=count;}
 getLastRow(){let n=this.grid.length;while(n&&(!this.grid[n-1]||this.grid[n-1].every(x=>x===''||x==null)))n--;return n;}
 getDataRange(){return {getValues:()=>this.grid.slice(0,this.getLastRow()).map(r=>r.slice())};}
 getRange(row,col,height,width){return {setValues:values=>{
  assert.equal(values.length,height);assert(values.every(r=>r.length===width));
  if(this.book.source)throw Error('Source writes forbidden');
  if(this.book.throwNext){this.book.throwNext=false;throw Error('Injected write failure');}
  assert(values.every(r=>r.every(v=>typeof v!=='string'||!v.startsWith('='))),'Formula-like storage value');
  for(let i=0;i<height;i++){this.grid[row-1+i]||=[];for(let j=0;j<width;j++)this.grid[row-1+i][col-1+j]=values[i][j];}
  this.book.writes++;
 }};}
}
class Book{
 constructor(id,source=false){this.id=id;this.source=source;this.list=[];this.writes=0;}
 getId(){return this.id;}getUrl(){return 'https://docs.google.com/spreadsheets/d/'+this.id+'/edit';}
 getSpreadsheetTimeZone(){return 'Asia/Dhaka';}getSheets(){return this.list;}getSheetByName(name){return this.list.find(s=>s.name===name);}
 add(name,grid){this.list.push(new Sheet(this,name,grid));return this;}
}
function fixture(standalone=false){
 const source=new Book('source-book',true),books=new Map([['source-book',source]]);
 const users=[
 {email:'admin@example.test',name:'Administrator',role:'admin',active:true,department:'All'},
 {email:'amina@example.test',name:'Amina',role:'user',active:true,department:'Sewing'},
 {email:'bashir@example.test',name:'Bashir',role:'user',active:true,department:'QA'}];
 const tasks=Array.from({length:93},(_,i)=>({id:'legacy-'+(i+1),title:i===0?'<img src=x onerror=alert(1)> Task':'Task '+(i+1),description:'Original task description '+i,assignee_email:i===0?users[1].email:i===1?users[2].email:'',priority:'Normal',plan_date:'2026-10-18',plan_minutes:10,status:'Pending',version:1,created_at:'2026-10-17T12:00:00.000Z'}));
 const work=[{id:'w1',employee_email:users[1].email,work_date:'2026-10-18',minutes:60,status:'Approved'},{id:'w2',employee_email:users[2].email,work_date:'2026-10-18',minutes:90,status:'Pending'}];
 const leaves=[{id:'l1',employee_email:users[1].email,from_date:'2026-10-19',to_date:'2026-10-20',type:'Casual',reason:"Family's event",status:'Pending'}];
 for(const [name,rows]of Object.entries({tasks,users,work_hours:work,leave_requests:leaves})){const h=C[name];source.add(name,[h,...rows.map(r=>h.map(k=>r[k]??''))]);}
 source.add('audit',[['at','actor','action'],['2026-10-17','admin','IMPORT']]).add('settings',[['key','value'],['test','preserve']]);
 const baseline=JSON.stringify(source.list.map(s=>s.grid));
 const props={DATACELL_SOURCE_SHEET_ID:'source-book',DATACELL_INITIAL_ADMIN_PASSWORD:'TestAdministratorPassword!'};
 let locked=false;
 const Property={getProperty:k=>props[k]??null,setProperty:(k,v)=>{props[k]=v;},deleteProperty:k=>{delete props[k];}};
 const U={newBlob:(bytes)=>({bytes:Buffer.from(bytes),getDataAsString:()=>Buffer.from(bytes).toString('utf8')}),base64Decode:text=>Array.from(Buffer.from(text,'base64')),ungzip:blob=>U.newBlob(require('node:zlib').gunzipSync(blob.bytes)),getUuid:()=>crypto.randomUUID(),Charset:{UTF_8:'utf8'},DigestAlgorithm:{SHA_256:'sha256'},
 computeDigest:(algorithm,s)=>Array.from(crypto.createHash('sha256').update(s).digest()),
 computeHmacSha256Signature:(s,k)=>Array.from(crypto.createHmac('sha256',k).update(s).digest()),
 formatDate:(d,tz,fmt)=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(d).map(x=>[x.type,x.value]));return fmt==='yyyy-MM-dd'?p.year+'-'+p.month+'-'+p.day:fmt==='HH:mm'?p.hour+':'+p.minute:p.hour+':'+p.minute+':'+p.second;}};
 const ctx=vm.createContext({Date:Clock,Utilities:U,PropertiesService:{getScriptProperties:()=>Property},
 LockService:{getScriptLock:()=>({tryLock:()=>{if(locked)return false;locked=true;return true;},waitLock:()=>{if(locked)throw Error('Busy');locked=true;},releaseLock:()=>{locked=false;}})},
 SpreadsheetApp:{openById:id=>{assert(books.has(id));return books.get(id);},create:()=>{const b=new Book('destination-book');b.add('Sheet1',[]);books.set(b.id,b);return b;},flush:()=>{}},
 HtmlService:{createHtmlOutput:content=>({getContent:()=>content,setTitle(){return this;},addMetaTag(){return this;}}),createHtmlOutputFromFile:name=>({getContent:()=>fs.readFileSync(path.join(root,name+'.html'),'utf8'),setTitle(){return this;},addMetaTag(){return this;}})}});
 if(standalone)vm.runInContext(fs.readFileSync(path.join(root,'Standalone-Code.gs'),'utf8'),ctx);else{vm.runInContext(core,ctx);vm.runInContext(glue,ctx);}
 const migration=ctx.setupFullDashboard_(),dest=books.get('destination-book');
 const call=(b)=>JSON.parse(JSON.stringify(ctx.sheetsRequest(b)));
 const login=(name,password='TestAdministratorPassword!')=>{const r=call({op:'login',name,password});assert.equal(r.ok,true,JSON.stringify(r));return r.data.token;};
 const admin=login('admin');
 const read=()=>JSON.parse(JSON.stringify(ctx.sheetsRead_(dest).state));
 const write=fn=>{const loaded=ctx.sheetsRead_(dest);fn(loaded.state);ctx.sheetsWrite_(loaded.sheet,loaded.state,loaded.revision+1);};
 const rpc=(token,b)=>call({...b,token});
 const data=(table,method='GET',body,query='',token=admin,prefer)=>rpc(token,{op:'data',table,method,body,query,prefer,editor:true,expected:Object.fromEntries(read().tables.tasks.map(t=>[JSON.stringify([t.sl]),t.updated_at]))});
 const provision=()=>{let result=rpc(admin,{op:'save-users',rows:[{name:'admin',password:'',color:'#f5c842'},{name:'Amina',password:'AminaPassword10!',color:'#60a5fa'},{name:'Bashir',password:'BashirPassword10!',color:'#60a5fa'}]});assert.equal(result.ok,true,JSON.stringify(result));return {amina:login('Amina','AminaPassword10!'),bashir:login('Bashir','BashirPassword10!')};};
 return {ctx,source,dest,books,props,baseline,migration,admin,read,write,call,rpc,data,provision,login,sourceIntact:()=>assert.equal(JSON.stringify(source.list.map(s=>s.grid)),baseline)};
}
function denied(r,status){assert.equal(r.ok,false,JSON.stringify(r));if(status)assert.equal(r.status,status);return r;}

module.exports={fixture};
