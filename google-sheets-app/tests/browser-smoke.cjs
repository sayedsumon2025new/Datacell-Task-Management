const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {fixture}=require('./fixture.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const live=fixture(),checks=[],errors=[],requests=[],dialogs=[];
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Dhaka'});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  page.on('dialog',async d=>{dialogs.push(d.message());await d.dismiss();});
  await page.route('**/*',r=>r.abort());
  await page.exposeFunction('__sheetsServer',body=>live.call(body));
  await page.addInitScript(()=>{
   const NativeDate=Date,fixed=NativeDate.parse('2026-10-18T09:00:00.000Z');
   window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};
   window.Chart=class Chart{
    static defaults={font:{}};static instances={};static register(){}static getChart(){return null;}
    constructor(ctx,config={}){this.data=config.data||{};this.options=config.options||{};this.config=config;this.ctx=ctx;this.id=Math.random();Chart.instances[this.id]=this;}
    destroy(){delete Chart.instances[this.id];}update(){}
   };
   function runner(success,failure){return {withSuccessHandler(fn){return runner(fn,failure)},withFailureHandler(fn){return runner(success,fn)},sheetsRequest(body){window.__sheetsServer(body).then(success,failure)}}}
   window.google={script:{run:runner()}};
  });
  await page.goto('about:blank');
  await page.setContent(fs.readFileSync(path.join(__dirname,'..','Dashboard.html'),'utf8'),{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#loginUser')?.options.length>=4);
  await page.selectOption('#loginUser','admin');await page.fill('#loginPass','TestAdministratorPassword!');await page.click('#loginBtn');
  await page.waitForSelector('#sidebarNav button');await page.waitForFunction(()=>document.querySelector('#mainContent')?.textContent.includes('93'));
  checks.push('Admin login and 93-task overview');
  await page.getByRole('button',{name:'MASTER TASKS',exact:true}).click();
  await page.locator('#mainContent tbody tr').nth(2).getByRole('button',{name:'EDIT',exact:true}).click();
  await page.selectOption('#master-person','Amina');await page.getByRole('button',{name:'SAVE CHANGES',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.toast')?.textContent.includes('Task changes saved'));
  assert.equal(live.read().tables.tasks.find(t=>t.sl===3).person,'Amina');checks.push('Task assignment saved through RPC');
  await page.getByRole('button',{name:'PUBLISH REPORTS',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#refreshDataBtn')?.disabled===false);
  checks.push('Report publication');
  for(const label of ['OVERVIEW','KPI','MULTI SKILL','ALL TASKS','WORKING HOURS','LEAVE MANAGEMENT','SETTINGS']){
   await page.locator('#sidebarNav button').filter({hasText:label}).first().click();
   assert((await page.locator('#mainContent').innerText()).trim().length>0);checks.push(label+' navigation');
  }
  await page.getByRole('button',{name:'WORK HOUR APPROVAL',exact:true}).click();
  const portal=page.frameLocator('iframe[data-work-hour-approval]');
  await portal.locator('#who').filter({hasText:'admin'}).waitFor();
  const report=portal.frameLocator('#dashboard');
  await report.locator('button.tab[data-t="p1"]').waitFor();
  for(const id of ['p1','p2','p3','p4','p5','p6','p7']){
   await report.locator('button.tab[data-t="'+id+'"]').click();assert(await report.locator('#'+id).isVisible());checks.push('Work Hour '+id);
  }
  await portal.locator('#openUsers').click();await portal.locator('#permissionRows input').first().waitFor();checks.push('Work Hour User & Tab Access');
  live.provision();
  await page.locator('#logoutBtn').click();await page.selectOption('#loginUser','Amina');await page.fill('#loginPass','AminaPassword10!');await page.click('#loginBtn');
  await page.waitForFunction(()=>document.querySelector('#ucNm')?.textContent==='Amina');
  await page.waitForFunction(()=>typeof tasks!=='undefined'&&tasks.length===2);
  assert.deepEqual(await page.evaluate(()=>tasks.map(t=>t.sl)),[1,3]);
  assert(!(await page.locator('#sidebarNav').innerText()).includes('SETTINGS'));checks.push('Ordinary user sees only assigned tasks and allowed navigation');
  const denied=await page.evaluate(()=>DataCellMainClient.request({op:'data',table:'tasks',method:'PATCH',query:'sl=eq.2',body:{person:'Amina'},is_admin:true}).then(()=>false,e=>e.status===403||e.status===409));
  assert.equal(denied,true);checks.push('Direct unauthorized task write rejected');
  assert.equal(dialogs.length,0);checks.push('Untrusted task HTML did not execute');
  assert.equal(requests.filter(x=>/supabase/i.test(x)).length,0);checks.push('No Supabase network requests');
  assert.deepEqual(errors,[]);checks.push('No uncaught JavaScript errors');
  live.sourceIntact();checks.push('Source fixture unchanged');
  console.log(JSON.stringify({passed:checks.length,checks,chartRendering:'Chart API test double; actual chart rendering remains a live-deployment check',backend:'Actual server source with mocked Sheets services'},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
