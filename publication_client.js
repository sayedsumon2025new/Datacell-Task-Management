// Keeps credentials in memory. Cached report data is used only after server authorization.
(function(g){
 const nativeFetch=g.fetch.bind(g);
 class PublicationCache{
  constructor(){this.memory=new Map();this.secret=null;this.key=null;}
  setSecret(hex){
   if(this.secret===hex)return;
   this.memory.clear();this.secret=hex;
   this.key=typeof hex==='string'&&/^[a-f0-9]{64}$/.test(hex)?g.crypto.subtle.importKey('raw',Uint8Array.from(hex.match(/../g),x=>parseInt(x,16)),{name:'AES-GCM'},false,['encrypt','decrypt']):null;
  }
  clear(){this.memory.clear();}
  forget(){this.memory.clear();this.secret=null;this.key=null;}
  async get(name){
   if(this.memory.has(name))return this.memory.get(name);
   if(!this.key)return null;
   try{
    const item=JSON.parse(g.localStorage.getItem(name)||'null');if(!item?.iv||!item?.body)return null;
    const bytes=x=>Uint8Array.from(g.atob(x),c=>c.charCodeAt(0));
    const decoded=await g.crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(item.iv)},await this.key,bytes(item.body));
    const data=JSON.parse(new TextDecoder().decode(decoded));this.memory.set(name,data);return data;
   }catch(e){return null;}
  }
  async set(name,data){
   this.memory.set(name,data);if(!this.key)return;
   try{
    const iv=g.crypto.getRandomValues(new Uint8Array(12));
    const encrypted=new Uint8Array(await g.crypto.subtle.encrypt({name:'AES-GCM',iv},await this.key,new TextEncoder().encode(JSON.stringify(data))));
    const base64=bytes=>{let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return g.btoa(text);};
    g.localStorage.setItem(name,JSON.stringify({iv:base64(iv),body:base64(encrypted)}));
   }catch(e){/* Memory cache remains usable when persistent storage is full. */}
  }
 }
 class PublicationClient{
  constructor(url,key){this.url=url;this.key=key;this.token=null;this.user=null;this.head=null;this.epoch=0;this.cache=new PublicationCache();this.receipts=new Map();}
  async request(body){
   const r=await nativeFetch(this.url+'/functions/v1/datacell-access',{method:'POST',headers:{apikey:this.key,'Content-Type':'application/json',...(this.token?{Authorization:'Bearer '+this.token}:{})},body:JSON.stringify(body)});
   const data=await r.json();if(!r.ok)throw Object.assign(new Error(data.error||'Request failed'),{status:r.status});return data;
  }
  async names(){return this.request({op:'names'});}
  async login(name,password){const epoch=++this.epoch;const r=await this.request({op:'login',name,password});if(this.epoch!==epoch)throw new Error('Login cancelled');this.token=r.token;this.user=r.name;this.head=null;this.cache.setSecret(r.cacheSecret);this.receipts.clear();return r;}
  async logout(){
   const old=this.user,pending=this.token?this.request({op:'logout'}):Promise.resolve();this.epoch++;
   try{
    this.token=null;this.user=null;this.head=null;this.cache.forget();this.receipts.clear();
    try{for(const k of Object.keys(g.localStorage))if(k.startsWith('datacell-report:'+old+':'))g.localStorage.removeItem(k);}catch(e){}
   }finally{await pending.catch(()=>{});}
  }
  async prepareReports(){this.head=await this.request({op:'head'});if(!this.head)throw new Error('Admin must publish the first report');return this.head;}
  async publish(){const current=await this.request({op:'head'});const r=await this.request({op:'publish',expectedVersion:current?.version??null});this.head=r;this.cache.clear();this.receipts.clear();return r;}
  cacheRead(key){return this.cache.get(key);}
  cacheWrite(key,data){return this.cache.set(key,data);}
  async data(table,method,query='',body,prefer,editor=false){
   const epoch=this.epoch;
   const q=new URLSearchParams(query),args={op:'data',table,method,query,body,prefer,editor};
   if(method==='GET'&&!editor){
    const filters=[...q].filter(([k])=>!['select','order','limit','offset'].includes(k));
    const confirmed=this.receipts.get(table);
    if(filters.length&&confirmed&&filters.every(([,v])=>v.startsWith('eq.'))){
     const rows=confirmed.filter(row=>filters.every(([k,v])=>String(row[k]??'')===v.slice(3)));
     if(rows.length){await this.request({op:'head'});const selected=q.get('select');return selected&&selected!=='*'?rows.map(row=>Object.fromEntries(selected.split(',').map(k=>[k,row[k]]))):rows;}
    }
    if(!this.head)await this.prepareReports();args.version=this.head.version;
    const key='datacell-report:'+this.user+':'+JSON.stringify([table,q.toString(),args.version]);
    const cached=await this.cacheRead(key);if(cached)args.knownVersion=cached.cacheKey;
    const result=await this.request(args);
    if(this.epoch!==epoch)throw new Error('Session changed during report load');
    if(result&&Object.hasOwn(result,'unchanged')){
     if(result.unchanged){if(!cached)throw new Error('Cached report is unavailable');return cached.data;}
     await this.cacheWrite(key,result);return result.data;
    }
    return result;
   }
   const result=await this.request(args);
   if(this.epoch!==epoch)throw new Error('Session changed during data request');
   if(method==='DELETE')this.receipts.delete(table);
   else if(method!=='GET'&&Array.isArray(result))this.receipts.set(table,result);
   return result;
  }
  async route(input,options={}){
   const url=String(input);if(!url.startsWith(this.url+'/rest/v1/'))return nativeFetch(input,options);
   try{
    const parsed=new URL(url),table=decodeURIComponent(parsed.pathname.slice('/rest/v1/'.length));
    const method=options.method||'GET';
    if(table==='users'&&method==='GET'&&!this.token)return new Response(JSON.stringify(await this.names()),{headers:{'Content-Type':'application/json'}});
    const body=options.body?JSON.parse(options.body):undefined;
    const headers=new Headers(options.headers||{});
    const result=await this.data(table,method,parsed.search.slice(1),body,headers.get('Prefer'),options.publicationEditor===true);
    return new Response(JSON.stringify(result??[]),{headers:{'Content-Type':'application/json'}});
   }catch(e){return new Response(JSON.stringify({message:e.message,error:e.message}),{status:e.status||400,headers:{'Content-Type':'application/json'}});}
  }
 }
 g.PublicationClient=PublicationClient;
 g.PublicationCache=PublicationCache;
})(globalThis);
