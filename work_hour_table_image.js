// html2canvas 1.4.1 is vendored locally (MIT); no report data leaves this browser.
(()=>{
 'use strict';
 const button=document.getElementById('copy2'),message=document.getElementById('copy2Msg');
 const allowed=()=>{const p=parent.workHourAccess;return p?.active===true&&(p.is_admin===true||(p.permissions?.p2?.view===true&&p.permissions?.p2?.export===true));};
 let busy=false;
 const status=(text,error=false)=>{message.textContent=text;message.style.color=error?'#b42318':'#006b47';};
 async function render(table){
  // Snapshot the current filtered report. Give the clone its full size outside the
  // scrolling panel; sticky headings and the current scroll position cannot crop it.
  const holder=document.createElement('div'),copy=table.cloneNode(true);
  holder.className='table-scroll';holder.setAttribute('aria-hidden','true');holder.inert=true;
  holder.style.cssText='position:absolute;left:0;top:0;z-index:-10000;pointer-events:none;background:#fff;padding:1px;box-sizing:content-box;overflow:visible;max-height:none;scrollbar-gutter:auto;';
  copy.style.width=Math.ceil(table.getBoundingClientRect().width)+'px';copy.style.margin='0';
  copy.querySelectorAll('thead,tfoot').forEach(e=>{e.style.position='static';e.style.top='auto';e.style.transform='none';});
  holder.append(copy);document.body.append(holder);
  try{
   await document.fonts.ready;
   const width=Math.ceil(copy.getBoundingClientRect().width)+2,height=Math.ceil(copy.getBoundingClientRect().height)+2;
   holder.style.width=(width-2)+'px';
   const canvas=await html2canvas(holder,{backgroundColor:'#ffffff',scale:3,width,height,windowWidth:Math.max(width,innerWidth),windowHeight:Math.max(height,innerHeight),scrollX:0,scrollY:0,logging:false});
   return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not create PNG.')),'image/png'));
  }finally{holder.remove();}
 }
 function download(blob,date){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`Department-wise-EOT-OT-${date||'report'}-HD.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 button.addEventListener('click',async()=>{
  if(busy||!allowed())return;
  const table=document.getElementById('t2');
  if(!table?.querySelector('tbody tr')){status('Select a date with report data first.',true);return;}
  busy=true;button.disabled=true;status('Preparing full table image…');
  const date=document.getElementById('eotDate').value,png=render(table);
  // Pass the promise while the click still has user activation (Safari included).
  try{
   if(!navigator.clipboard?.write||!window.ClipboardItem)throw new Error('Clipboard unavailable');
   await navigator.clipboard.write([new ClipboardItem({'image/png':png})]);
   status('Full table copied in HD. Paste with Ctrl+V.');
  }catch(error){
   try{download(await png,date);status('Clipboard unavailable. The same HD PNG was downloaded.',true);}
   catch(renderError){status('Image could not be created. Please try again.',true);}
  }finally{busy=false;button.disabled=false;}
 });
})();
