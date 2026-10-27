import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import https from 'node:https';
import {Readable} from 'node:stream';

export function sourceURL(value,base){
  let url;try{url=new URL(value,base);}catch{throw new Error('Enter a public HTTPS source address.');}
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.href.length>2000||isIP(host.replace(/^\[|\]$/g,''))||!host.includes('.')||/(^|\.)(localhost|local|internal|lan|home|test|invalid|onion)$/.test(host)||host.endsWith('.')||/[\x00-\x20]/.test(String(value)))throw new Error('Use a public HTTPS source without credentials, local addresses or custom ports.');
  url.hash='';return url;
}
export function publicAddress(address){
  if(isIP(address)===4){const n=address.split('.').map(Number);return !(n[0]===0||n[0]===10||n[0]===127||n[0]>=224||n[0]===169&&n[1]===254||n[0]===172&&n[1]>=16&&n[1]<=31||n[0]===192&&(n[1]===168||n[1]===0||n[1]===2)||n[0]===100&&n[1]>=64&&n[1]<=127||n[0]===198&&(n[1]===18||n[1]===19||n[1]===51&&n[2]===100)||n[0]===203&&n[1]===0&&n[2]===113);}
  // Accept native global-unicast IPv6 only; mapped IPv4, ULA, link-local and multicast are refused.
  return isIP(address)===6&&/^[23][0-9a-f]{3}:/i.test(address)&&!/^2001:(?:0:|db8:|10:|2:)/i.test(address)&&!/^2002:/i.test(address);
}
export async function resolvePublic(host,{lookupImpl=lookup}={}){
  sourceURL('https://'+host+'/');const addresses=await lookupImpl(host,{all:true,verbatim:true});
  if(!addresses.length||addresses.some(item=>!publicAddress(item.address)))throw new Error('This source resolves to a private or reserved address.');
  return addresses.find(item=>item.family===4)||addresses[0];
}
export async function publicFetch(address,{headers,signal}={}){
  const url=sourceURL(address);signal?.throwIfAborted();const resolved=await Promise.race([resolvePublic(url.hostname),...(signal?[new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))]:[])]);signal?.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const request=https.request(url,{headers,signal,family:resolved.family,autoSelectFamily:false,lookup:(_host,_options,done)=>done(null,resolved.address,resolved.family)},response=>{
      try{const values=new Headers();for(let i=0;i<response.rawHeaders.length;i+=2)values.append(response.rawHeaders[i],response.rawHeaders[i+1]);const empty=[204,205,304].includes(response.statusCode);if(empty)response.resume();resolve(new Response(empty?null:Readable.toWeb(response),{status:response.statusCode,headers:values}));}catch(error){response.destroy();reject(error);}
    });request.on('error',reject);request.end();
  });
}
