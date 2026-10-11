import {Service} from './service.mjs';
import {createDatacellHandler} from './datacell-handler.mjs';
import {createWorkHourHandler} from './work-hour-handler.ts';

const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export default {
 async fetch(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(path==='/api/health'){
   if(!env.DB||!env.AUTH_SECRET)return json({status:'setup_required'},503);
   try{
    const counts=await env.DB.prepare('SELECT (SELECT count(*) FROM users) AS accounts,(SELECT count(*) FROM migration_manifest) AS imported_tables').first();
    const head=await env.DB.prepare('SELECT version FROM publication_head WHERE id=1').first();
    return json({status:counts.accounts>0&&head?'ready':'migration_required'});
   }catch{return json({status:'migration_required'},503);}
  }
  if(!path.startsWith('/functions/v1/')&&!path.startsWith('/auth/v1/')&&!path.startsWith('/rest/v1/'))return env.ASSETS.fetch(request);
  if(!env.DB||!env.AUTH_SECRET||env.AUTH_SECRET.length<32)return json({error:'Cloudflare database or authentication secret is not configured'},503);
  const origin=request.headers.get('Origin');
  if(origin&&origin!==url.origin&&origin!=='https://sayedsumon2025new.github.io')return json({error:'Origin not allowed'},403);
  const service=new Service(env,request);
  try{
   if(path==='/functions/v1/datacell-access')return await createDatacellHandler(service)(request);
   if(path==='/functions/v1/work-hour-access')return await createWorkHourHandler(service)(request);
   if(path==='/auth/v1/token'&&request.method==='POST')return json(await service.workLogin(url.searchParams.get('grant_type'),await request.json()));
   if(path==='/auth/v1/logout'&&request.method==='POST'){
    const token=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
    const {digest}=await import('./crypto.mjs');
    await service.db.prepare('DELETE FROM sessions WHERE token_hash=? AND kind=?').bind(await digest(token),'work-hour').run();
    return json({});
   }
   return json({error:'Endpoint not found'},404);
  }catch(e){return json({error:e.status?e.message:'Server request failed'},e.status||500);}
 }
};

