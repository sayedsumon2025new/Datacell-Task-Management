// The server enforces data access; these controls mirror current account permissions.
(()=>{
 const permitted=(tab,action='view')=>{if(action==='change')return permitted(tab,'edit')||permitted(tab,'delete');const p=parent.workHourAccess;return p?.active===true&&(p.is_admin===true||action!=='publish'&&p.permissions?.[tab]?.[action]===true)};
 const actionIds={whReload:'publish',eotReload:'publish',dsReload:'publish',otcReload:'publish',dprReload:'publish',llReload:'publish',uiReload:'publish',exp:'export',pr1:'export',x2:'export',pr2:'export',copy2:'export',uiExcel:'export',uiPdf:'export',uiAdd:'edit',uiSave:'change',uiUndoDelete:'delete',dsSave:'edit',otcUpload:'edit',dprUpload:'edit',llSave:'edit'};
 let pending=false,lastEntryScope='';
 window.whApplyAccess=()=>{
  pending=false;
  const signature=JSON.stringify(parent.workHourAccess?.permissions?.p7?.entry_scope||{});
  if(signature!==lastEntryScope){lastEntryScope=signature;window.uiApplyEntryScope?.();}
  document.querySelectorAll('.tab').forEach(b=>{b.hidden=!permitted(b.dataset.t);b.style.display=b.hidden?'none':''});
  document.querySelectorAll('[id^="p"]').forEach(panel=>{
   if(!/^p[1-7]$/.test(panel.id))return;
   if(!permitted(panel.id))panel.classList.add('hide');
   panel.querySelectorAll('button').forEach(b=>{
    const action=actionIds[b.id]||(b.matches('.del,[data-ll-delete]')?'delete':b.matches('.edit,[data-ll-edit]')?'edit':null);
    if(action){const hide=!permitted(panel.id,action);if(b.hidden!==hide)b.hidden=hide;b.style.display=hide?'none':'';}
   });
   if(panel.id==='p7')panel.querySelectorAll('#uiBody input').forEach(input=>{const row=window.UI_ROWS?.[Number(input.dataset.row)];const read=!permitted('p7','edit')||!window.uiCanEditRow?.(row||window.uiRowAt?.(Number(input.dataset.row)))||['present_manpower','total_manpower','ot_5_pm'].includes(input.dataset.key);if(input.readOnly!==read)input.readOnly=read;});
   if(panel.id==='p3')panel.querySelectorAll('#dsDept,#dsSection').forEach(i=>i.readOnly=!permitted('p3','edit'));
  });
  window.uiControls?.();
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

