(function(g){
 'use strict';
 const slots=['ot_5_pm','ot_6_pm','ot_7_pm','ot_8_pm','ot_9_pm','ot_10_pm','ot_11_pm','ot_12_am','ot_1_am'];
 const qty=x=>Number.isFinite(Number(x))?Number(x):0;
 const key=x=>String(x||'').trim().toLowerCase();
 function derive(plans,actuals,date){
  const groups=new Map();let rounded=0,outside=0,invalid=0;
  const group=name=>{const k=key(name);if(!groups.has(k))groups.set(k,{department:String(name||'').trim(),total:null,hours:null,planned:slots.map(()=>null),used:slots.map(()=>0),later:0});return groups.get(k)};
  for(const p of plans){if(p.work_date!==date||!key(p.department))continue;const d=group(p.department);d.total=(d.total??0)+qty(p.present_manpower);if(p.asking_hour!=null&&p.asking_hour!=='')d.hours=Math.max(d.hours??0,qty(p.asking_hour));slots.forEach((slot,i)=>d.planned[i]=(d.planned[i]??0)+qty(p[slot]));}
  const dated=actuals.filter(a=>a.work_date===date),available=dated.length>0;
  for(const a of dated){if(!key(a.department)||a.total_ot_hour==null||a.total_ot_hour===''||!Number.isFinite(Number(a.total_ot_hour))||Number(a.total_ot_hour)<0){invalid++;continue;}
   const d=group(a.department),raw=Number(a.total_ot_hour),hour=Math.round(raw),count=a.employee_count==null?1:qty(a.employee_count);
   if(raw!==hour)rounded+=count;if(hour>0)d.later+=count;if(hour>=slots.length){outside+=count;continue;}d.used[hour]+=count;
  }
  const mismatches=[];
  const rows=[...groups.values()].sort((a,b)=>a.department.localeCompare(b.department)).map(d=>{
   const five=available&&d.total!=null?d.total-d.later:null;
   if(five!=null&&five<0)mismatches.push(d.department);
   let remaining=available&&d.total!=null?d.total-five:null;
   const result=[d.department,d.total,d.hours,[d.planned[0],five,d.total==null?null:d.planned[0]-d.total]];
   for(let i=1;i<slots.length;i++){
    const punch=available?d.used[i]:null;
    result.push([d.planned[i],remaining,remaining==null||d.planned[i]==null?null:remaining-d.planned[i],punch]);
    if(remaining!=null)remaining-=punch;
   }
   return result;
  });
  return {rows,available,rounded,outside,invalid,mismatches};
 }
 g.WorkHourEotModel={derive,slots};
})(globalThis);
