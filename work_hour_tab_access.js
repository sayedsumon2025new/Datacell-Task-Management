// The server enforces data access; these controls mirror current account permissions.
(()=>{
 const permitted=(tab,action='view')=>{const p=parent.workHourAccess;return p?.active===true&&(p.is_admin===true||p.permissions?.[tab]?.[action]===true)};
 const actionIds={exp:'export',pr1:'export',x2:'export',pr2:'export',uiExcel:'export',uiPdf:'export',uiAdd:'edit',uiSave:'edit',dsSave:'edit',otcUpload:'edit',dprUpload:'edit',llSave:'edit'};
 let pending=false;
 window.whApplyAccess=()=>{
  pending=false;
  document.querySelectorAll('.tab').forEach(b=>{b.hidden=!permitted(b.dataset.t);b.style.display=b.hidden?'none':''});
  document.querySelectorAll('[id^="p"]').forEach(panel=>{
   if(!/^p[1-7]$/.test(panel.id))return;
   if(!permitted(panel.id))panel.classList.add('hide');
   panel.querySelectorAll('button').forEach(b=>{
    const action=actionIds[b.id]||(b.matches('.del,[data-ll-delete]')?'delete':b.matches('.edit,[data-ll-edit]')?'edit':null);
    if(action){const hide=!permitted(panel.id,action);if(b.hidden!==hide)b.hidden=hide;}
   });
   if(panel.id==='p7')panel.querySelectorAll('#uiBody input').forEach(input=>{const read=!permitted('p7','edit')||['present_manpower','total_manpower','ot_5_pm'].includes(input.dataset.key);if(input.readOnly!==read)input.readOnly=read;});
   if(panel.id==='p3')panel.querySelectorAll('#dsDept,#dsSection').forEach(i=>i.readOnly=!permitted('p3','edit'));
  });
  const active=document.querySelector('.tab.on');
  if(!active||!permitted(active.dataset.t)){
   const first=Array.from(document.querySelectorAll('.tab')).find(b=>permitted(b.dataset.t));
   if(first)first.click();
  }
 };
 const schedule=()=>{if(!pending){pending=true;requestAnimationFrame(window.whApplyAccess)}};
 document.addEventListener('click',e=>{
  const b=e.target.closest('button'),panel=e.target.closest('[id^="p"]');
  if(b?.matches('.tab')&&!permitted(b.dataset.t)){e.stopImmediatePropagation();e.preventDefault();return;}
  if(panel&&/^p[1-7]$/.test(panel.id)){
   const action=b&&(actionIds[b.id]||(b.matches('.del,[data-ll-delete]')?'delete':b.matches('.edit,[data-ll-edit]')?'edit':null));
   if(!permitted(panel.id)||action&&!permitted(panel.id,action)){e.stopImmediatePropagation();e.preventDefault();}
  }
 },true);
 // Rows and busy states are re-rendered by the existing dashboard.
 new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
 schedule();
})();
