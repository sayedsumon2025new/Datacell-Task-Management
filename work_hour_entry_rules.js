(function(g){
 'use strict';
 const norm=v=>String(v??'').trim().replace(/\s+/g,' ').toLowerCase();
 const level=v=>norm(v).replace(/^level\s*[-:]?\s*0*(\d+)$/,'level-$1');
 const line=v=>{const text=norm(v),m=text.match(/^(?:(?:ln|line)\s*[-:]?\s*)?(\d+)$/);return m?m[1].replace(/^0+(?=\d)/,''):text;};
 const key=r=>JSON.stringify([r.work_date||'',norm(r.department),norm(r.section),level(r.level),line(r.line_no)]);
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});let cachedSecond,cachedClock;
 function clock(now){const second=Math.floor(now.getTime()/1000);if(second===cachedSecond)return cachedClock;const parts=formatter.formatToParts(now);const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));cachedSecond=second;return cachedClock={date:p.year+'-'+p.month+'-'+p.day,time:p.hour+':'+p.minute+':'+p.second};}
 const allowed=(admin,date,now)=>{if(admin===true)return true;const c=clock(now);return date===c.date&&c.time<'17:00:00';};
 const complete=r=>!!(r.work_date&&norm(r.department)&&norm(r.section)&&(!(['sewing','quality assurance'].includes(norm(r.department))&&norm(r.section)==='sewing')||level(r.level)&&line(r.line_no)));
 g.WorkHourEntryRules={norm,level,line,key,clock,allowed,complete};
})(globalThis);
