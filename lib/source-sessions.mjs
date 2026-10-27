import {sourceURL} from './source-policy.mjs';
const token=/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,200}$/;
export function sessionCookie(cookie,address){
  const url=sourceURL(address),domain=String(cookie?.domain||url.hostname).replace(/^\./,'').toLowerCase(),cookiePath=cookie?.path||'/';
  if(!cookie||!token.test(cookie.name)||typeof cookie.value!=='string'||cookie.value.length>4096||/[^\x21-\x7e]|[;,]/.test(cookie.value)||!(url.hostname===domain||url.hostname.endsWith('.'+domain))||!domain.includes('.')||cookiePath[0]!=='/'||cookiePath.length>1000||/[\x00-\x20;]/.test(cookiePath))throw new Error('Invalid source cookie.');
  const expires=cookie.expirationDate===undefined?Date.now()/1000+8*3600:Number(cookie.expirationDate);if(!Number.isFinite(expires))throw new Error('Invalid source cookie expiry.');
  return {name:cookie.name,value:cookie.value,path:cookiePath,expires:Math.min(expires,Date.now()/1000+8*3600)};
}
export class SourceSessions{
  constructor(library,descriptors){this.library=library;this.descriptors=descriptors;this.jars=new Map();this.challenges=new Map();this.epoch=0;}
  allowed(){const p=this.library.preferences();return !!(p.networkEnabled&&p.sourceSessions&&!p.incognito);}
  options(){return this.descriptors().filter(spec=>spec&&spec.enabled).map(spec=>({...spec,origin:sourceURL(spec.url).origin}));}
  descriptor(id){const spec=this.options().find(item=>item.id===id);if(!spec)throw new Error('This source is not enabled.');return spec;}
  state(){this.reconcile();return {enabled:this.allowed(),epoch:this.epoch,userAgent:this.library.preferences().userAgent,sources:this.options().map(spec=>({...spec,cookieCount:this.active(spec.origin).length,challenge:this.challenges.get(spec.origin)||null,expires:this.jars.get(spec.origin)?.expires||null}))};}
  reconcile(){if(!this.allowed()){if(this.jars.size||this.challenges.size)this.clear();return;}const origins=new Set(this.options().map(spec=>spec.origin));for(const [key,jar]of this.jars){if(!origins.has(key)||jar.expires<=Date.now()||jar.userAgent!==this.library.preferences().userAgent){this.jars.delete(key);this.epoch++;}else jar.cookies=jar.cookies.filter(cookie=>cookie.expires>Date.now()/1000);}for(const key of this.challenges.keys())if(!origins.has(key))this.challenges.delete(key);}
  active(origin){const jar=this.jars.get(origin);return jar&&jar.expires>Date.now()&&jar.userAgent===this.library.preferences().userAgent?jar.cookies.filter(cookie=>cookie.expires>Date.now()/1000):[];}
  userAgent(address){const jar=this.jars.get(sourceURL(address).origin);return this.allowed()&&jar&&jar.expires>Date.now()&&jar.userAgent===this.library.preferences().userAgent?jar.browserAgent:null;}
  headers(address){this.reconcile();if(!this.allowed())return {};const url=sourceURL(address),cookies=this.active(url.origin).filter(c=>url.pathname===c.path||url.pathname.startsWith(c.path.endsWith('/')?c.path:c.path+'/')).sort((a,b)=>b.path.length-a.path.length),value=cookies.map(c=>c.name+'='+c.value).join('; ');return value?{Cookie:value}:{};}
  adopt(id,cookies,{epoch,userAgent,browserAgent=userAgent}={}){
    if(!this.allowed())throw new Error('Enable optional networking and temporary source sessions outside Incognito.');
    const spec=this.descriptor(id);if(epoch!==this.epoch||userAgent!==this.library.preferences().userAgent)throw new Error('Session settings changed. Open a fresh source session.');
    if(typeof browserAgent!=='string'||browserAgent.length>500||!browserAgent.trim()||/[^\x20-\x7e]/.test(browserAgent))throw new Error('Invalid source browser User Agent.');
    if(!Array.isArray(cookies)||cookies.length>100)throw new Error('Source session has too many cookies.');
    const clean=cookies.map(c=>sessionCookie(c,spec.origin));if(clean.reduce((n,c)=>n+c.name.length+c.value.length,0)>16000)throw new Error('Source session cookies exceed the size limit.');
    this.jars.set(spec.origin,{cookies:clean,userAgent,browserAgent,expires:Date.now()+8*3600000});this.challenges.delete(spec.origin);return {ok:true,cookieCount:clean.length};
  }
  received(address,headers,epoch){
    const url=sourceURL(address),origin=url.origin,jar=this.jars.get(origin);if(!jar||!this.allowed()||epoch!==this.epoch)return;
    const defaultPath=url.pathname.slice(0,url.pathname.lastIndexOf('/'))||'/';
    for(const raw of headers.getSetCookie?.()||[]){try{const [first,...attributes]=raw.split(';'),at=first.indexOf('='),data={name:first.slice(0,at).trim(),value:first.slice(at+1).trim(),domain:url.hostname,path:defaultPath};if(at<1)continue;for(const part of attributes){const index=part.indexOf('='),name=(index<0?part:part.slice(0,index)).trim().toLowerCase(),value=part.slice(index+1).trim();if(name==='domain')data.domain=value;if(name==='path'&&value.startsWith('/'))data.path=value;if(name==='max-age')data.expirationDate=Date.now()/1000+Number(value);if(name==='expires'&&data.expirationDate===undefined)data.expirationDate=Date.parse(value)/1000;}const cookie=sessionCookie(data,origin),next=jar.cookies.filter(c=>c.name!==cookie.name||c.path!==cookie.path);if(cookie.expires>Date.now()/1000)next.push(cookie);if(next.length<=100&&next.reduce((n,c)=>n+c.name.length+c.value.length,0)<=16000)jar.cookies=next;}catch{}}
  }
  challenge(address){const origin=sourceURL(address).origin;if(this.options().some(spec=>spec.origin===origin))this.challenges.set(origin,Date.now());}
  clear(id){if(id){const spec=this.descriptor(id);this.jars.delete(spec.origin);this.challenges.delete(spec.origin);}else{this.jars.clear();this.challenges.clear();}this.epoch++;return {ok:true};}
}
