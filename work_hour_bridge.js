// Existing report validation and pagination shared with the secure portal.
async function workHourApprovalLoadState(){
  const rows=await dbRequest('work_hour_approval_state','GET','id=eq.main&select=report_date,rows,updated_at');
  const r=Array.isArray(rows)?rows[0]:null;
  if(!r||!Array.isArray(r.rows)||!r.updated_at)throw new Error('Work Hour Approval data is unavailable. Reload before editing.');
  return {date:r.report_date||'',R:r.rows,updatedAt:r.updated_at};
}
async function workHourApprovalSaveState(state){
  if(!Array.isArray(state?.R)||!state.updatedAt)throw new Error('Reload Work Hour Approval before saving.');
  const payload={
    report_date:state&&state.date?state.date:null,
    rows:state.R,
    updated_by:currentUser||'',
    updated_at:new Date().toISOString()
  };
  const saved=await dbRequest('work_hour_approval_state','PATCH',
    'id=eq.main&updated_at=eq.'+encodeURIComponent(state.updatedAt),payload);
  if(!Array.isArray(saved)||saved.length!==1||saved[0].id!=='main'||!saved[0].updated_at)
    throw new Error('Data changed in another session or the save was not confirmed. Reload and try again.');
  await notifySaved();
  return {updatedAt:saved[0].updated_at};
}
window.workHourApprovalLoadState=workHourApprovalLoadState;
window.workHourApprovalSaveState=workHourApprovalSaveState;

async function workHourDepartmentSectionsList(){
  return await dbRequest('work_hour_department_sections','GET',
    'select=id,department,section,sort_order&order=sort_order.asc,id.asc');
}
async function workHourDepartmentSectionsSave(item){
  const department=String(item?.department||'').trim(),section=String(item?.section||'').trim();
  if(!department||!section)throw new Error('Department and Section are required');
  if(item?.id){
    const rows=await dbRequest('work_hour_department_sections','PATCH',
      'id=eq.'+encodeURIComponent(item.id),
      {department,section,updated_at:new Date().toISOString()});
    if(!Array.isArray(rows)||rows.length!==1)throw new Error('Department / Section update was not confirmed');
    await notifySaved();return rows[0];
  }
  const existing=await dbRequest('work_hour_department_sections','GET','select=sort_order&order=sort_order.desc&limit=1');
  const sortOrder=Math.max(1,Number(existing?.[0]?.sort_order||0)+1);
  const rows=await dbRequest('work_hour_department_sections','POST','',
    {department,section,sort_order:sortOrder,updated_at:new Date().toISOString()});
  if(!Array.isArray(rows)||rows.length!==1)throw new Error('Department / Section insert was not confirmed');
  await notifySaved();return rows[0];
}
async function workHourDepartmentSectionsDelete(id){
  const rows=await dbRequest('work_hour_department_sections','DELETE',
    'id=eq.'+encodeURIComponent(id));
  if(!Array.isArray(rows)||rows.length!==1)throw new Error('Department / Section delete was not confirmed');
  await notifySaved();return true;
}
window.workHourDepartmentSectionsList=workHourDepartmentSectionsList;
window.workHourDepartmentSectionsSave=workHourDepartmentSectionsSave;
window.workHourDepartmentSectionsDelete=workHourDepartmentSectionsDelete;

const WH_UI_FIELDS=['work_date','department','section','level','line_no','buyer','ewo','present_manpower','asking_manpower','asking_hour','ot_5_pm','ot_6_pm','ot_7_pm','ot_8_pm','ot_9_pm','ot_10_pm','ot_11_pm','ot_12_am','ot_1_am','staff','total_manpower','reason_eot','responsible_department'];
const WH_UI_NUMBERS=new Set(['present_manpower','asking_manpower','asking_hour','ot_5_pm','ot_6_pm','ot_7_pm','ot_8_pm','ot_9_pm','ot_10_pm','ot_11_pm','ot_12_am','ot_1_am','staff','total_manpower']);
async function workHourUserInterfaceList(context='p1'){
  return await fetchPagedTableRows('work_hour_user_interface','select=*&order=created_at.asc,id.asc',1000,50,context);
}
async function workHourUserInterfacePunchRows(workDate){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(workDate))throw new Error('A valid punch date is required.');
  return await fetchPagedTableRows('work_hour_daily_punch',
    'select=work_date,employee_id,department,section,line&work_date=eq.'+encodeURIComponent(workDate)+'&order=employee_id.asc');
}
window.workHourUserInterfacePunchRows=workHourUserInterfacePunchRows;
async function workHourUserInterfaceSave(row){
  if(!row?.id)throw new Error('Entry ID is required.');
  const payload={updated_by:currentUser||'',updated_at:new Date().toISOString()};
  for(const key of WH_UI_FIELDS){
    const value=row[key];
    if(WH_UI_NUMBERS.has(key)){
      const number=value==null||value===''?null:Number(value);
      if(number!==null&&(!Number.isFinite(number)||number<0||(key!=='asking_hour'&&!Number.isSafeInteger(number))))throw new Error('Invalid '+key);
      payload[key]=number;
    }else payload[key]=key==='work_date'?(value||null):String(value??'').trim();
  }
  payload.ot_5_pm=payload.asking_manpower;
  const hours=['ot_5_pm','ot_6_pm','ot_7_pm','ot_8_pm','ot_9_pm','ot_10_pm','ot_11_pm','ot_12_am','ot_1_am'];
  for(let i=1;i<hours.length;i++)if(payload[hours[i]]!==null&&payload[hours[i]]>(payload[hours[i-1]]??0))throw new Error(hours[i]+' cannot exceed the previous hour.');
  const totalFields=[...hours.slice(1),'staff'];payload.total_manpower=totalFields.some(key=>payload[key]!==null)?totalFields.reduce((sum,key)=>sum+(payload[key]??0),0):null;
  const query='id=eq.'+encodeURIComponent(row.id);
  let saved;
  if(row.updated_at){
    saved=await dbRequest('work_hour_user_interface','PATCH',query+'&updated_at=eq.'+encodeURIComponent(row.updated_at),payload);
  }else{
    saved=await dbRequest('work_hour_user_interface','POST','',{id:row.id,...payload});
  }
  if(!Array.isArray(saved)||saved.length!==1||saved[0].id!==row.id||!saved[0].updated_at)
    throw new Error('Entry changed in another session or save was not confirmed. Reload and try again.');
  await notifySaved();return saved[0];
}
window.workHourUserInterfaceList=workHourUserInterfaceList;
window.workHourUserInterfaceSave=workHourUserInterfaceSave;

// Seek one date at a time so employee row limits cannot hide older dates.
async function workHourReportDates(table){
 const dates=[];let before='';
 for(;;){
  const query='select=work_date&order=work_date.desc&limit=1'+(before?'&work_date=lt.'+encodeURIComponent(before):'');
  const rows=await dbRequest(table,'GET',query);
  if(!Array.isArray(rows))throw new Error('Report dates were not returned.');
  if(!rows.length)return dates;
  const date=rows[0].work_date;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||before&&date>=before)throw new Error('Invalid report date response.');
  dates.push(date);before=date;
 }
}
async function workHourOtCostDates(){return await workHourReportDates('work_hour_ot_cost');}
async function workHourOtCostRows(workDate){
  const q='select=id,work_date,employee_id,employee_name,department,designation,section,line,gross_salary,ot_rate,total_ot_hour,regular_ot_hour,extra_ot_hour,regular_ot_cost,extra_ot_cost,total_ot_cost'
    +(workDate?'&work_date=eq.'+encodeURIComponent(workDate):'')
    +'&order=work_date.desc,department.asc,section.asc,line.asc,employee_id.asc,id.asc';
  return await fetchPagedTableRows('work_hour_ot_cost',q);
}
async function workHourOtCostUpsert(rows){
  if(!Array.isArray(rows)||!rows.length)return [];
  const saved=await dbRequest('work_hour_ot_cost','POST','on_conflict=work_date,employee_id',
    rows,'resolution=merge-duplicates,return=representation');
  await notifySaved();
  return saved;
}
window.workHourOtCostDates=workHourOtCostDates;
window.workHourOtCostRows=workHourOtCostRows;
window.workHourOtCostUpsert=workHourOtCostUpsert;

async function fetchPagedTableRows(table,baseQuery,pageSize=1000,maxPages=Infinity,context){
  const all=[];
  for(let page=0;page<maxPages;page++){
    const sep=baseQuery?'&':'';
    const rows=await dbRequest(table,'GET',baseQuery+sep+'limit='+pageSize+'&offset='+(page*pageSize),undefined,undefined,context);
    if(!Array.isArray(rows))throw new Error('Report rows were not returned.');
    const list=rows;
    all.push(...list);
    if(list.length<pageSize)return all;
  }
  throw new Error('Report exceeded its page limit; reload with a narrower filter.');
}
async function workHourDailyPunchDates(){return await workHourReportDates('work_hour_daily_punch');}
async function workHourDailyPunchRows(workDate){
  const q='select=id,work_date,employee_id,employee_name,designation,doj,department,section,line,log_in,log_out'
    +(workDate?'&work_date=eq.'+encodeURIComponent(workDate):'')
    +'&order=work_date.desc,department.asc,section.asc,line.asc,employee_id.asc,id.asc';
  return await fetchPagedTableRows('work_hour_daily_punch',q);
}
async function workHourDailyPunchUpsert(rows){
  if(!Array.isArray(rows)||!rows.length)return [];
  const saved=await dbRequest('work_hour_daily_punch','POST','on_conflict=work_date,employee_id',
    rows,'resolution=merge-duplicates,return=representation');
  await notifySaved();
  return saved;
}
window.workHourDailyPunchDates=workHourDailyPunchDates;
window.workHourDailyPunchRows=workHourDailyPunchRows;
window.workHourDailyPunchUpsert=workHourDailyPunchUpsert;


async function workHourUserInterfaceSaveBatch(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>200)throw new Error('Send 1 to 200 entries.');
 const entries=rows.map(row=>{
  const payload={id:row.id};
  for(const key of WH_UI_FIELDS){const value=row[key];payload[key]=WH_UI_NUMBERS.has(key)?value==null||value===''?null:Number(value):key==='work_date'?(value||null):String(value??'').trim();}
  return {row:payload,expected_updated_at:row.updated_at||null};
 });
 const saved=await api({op:'save-entries',entries});
 const ids=new Set(rows.map(r=>r.id));
 if(!Array.isArray(saved)||saved.length!==rows.length||new Set(saved.map(r=>r.id)).size!==rows.length||saved.some(r=>!ids.has(r.id)||!r.updated_at))throw new Error('Batch save was not confirmed. Reload before retrying.');
 return saved;
}
window.workHourUserInterfaceSaveBatch=workHourUserInterfaceSaveBatch;
