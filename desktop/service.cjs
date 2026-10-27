const {readFile}=require('node:fs/promises');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {setTimeout:pause}=require('node:timers/promises');
const {localOrigin}=require('./policy.cjs');
async function verify(origin,instance){
  if(!localOrigin(origin)||typeof instance!=='string'||!/^[a-f0-9]{64}$/.test(instance))throw new Error('The running Folio server needs an update. Restart it with this release.');
  const home=await fetch(origin,{signal:AbortSignal.timeout(5000),redirect:'error'}),cookie=home.headers.get('set-cookie')?.split(';')[0];await home.body?.cancel();
  if(!home.ok||!cookie)throw new Error('Could not verify the local Folio server.');
  const response=await fetch(origin+'/api/runtime',{headers:{Cookie:cookie},signal:AbortSignal.timeout(5000),redirect:'error'});
  if(!response.ok)throw new Error('Could not verify the local Folio runtime.');const runtime=await response.json();if(runtime.instance!==instance)throw new Error('The local server does not match this Folio profile.');if(runtime.desktopFiles!==1||runtime.sourceSessions!==1)throw new Error('Restart the local Folio server with this release before using this desktop release.');
  return {origin,instance,captureProtection:runtime.captureProtection===true};
}
async function connectService({profile,nodeBinary,serverEntry}){
  let previous;try{previous=JSON.parse(await readFile(path.join(profile,'server-runtime.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(previous){if(!Number.isSafeInteger(previous.pid)||previous.pid<1)throw new Error('The local runtime record is invalid.');let alive=true;try{process.kill(previous.pid,0);}catch(error){if(error.code!=='ESRCH')throw error;alive=false;}if(alive){const pid=previous.pid;for(let attempt=0;!previous.origin&&Number.isFinite(previous.started)&&Date.now()-previous.started>=0&&Date.now()-previous.started<15000&&attempt<150;attempt++){await pause(100);const next=JSON.parse(await readFile(path.join(profile,'server-runtime.json'),'utf8'));if(next.pid!==pid)throw new Error('The local Folio server changed during startup. Reopen the desktop app.');previous=next;}const connection=await verify(previous.origin,previous.instance);return {...connection,owned:false,stop:async()=>{}};}}
  const child=spawn(nodeBinary,[serverEntry],{cwd:path.dirname(serverEntry),env:{...process.env,EBOOK_PROFILE:profile,PORT:'0'},windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
  const exited=new Promise(resolve=>child.once('close',resolve));let errors='';child.stderr.on('data',data=>{errors=(errors+data).slice(-2000);});child.stdout.resume();
  let connection;
  try{const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('The local reader server did not start in time.')),15000);const clean=()=>clearTimeout(timer);child.once('error',error=>{clean();reject(error);});child.once('exit',()=>{clean();reject(new Error('The local reader server stopped during startup. '+errors));});child.on('message',message=>{if(message?.type==='folio:ready'){clean();resolve(message);}});});connection=await verify(ready.origin,ready.instance);}catch(error){child.kill();await exited;throw error;}
  return {...connection,owned:true,child,async stop(){if(child.exitCode!==null)return;if(child.connected)child.send({type:'folio:shutdown',instance:connection.instance},error=>{if(error)child.kill();});let timer;await Promise.race([exited,new Promise(resolve=>{timer=setTimeout(()=>{child.kill();resolve();},7000);})]);clearTimeout(timer);}};
}
module.exports={connectService,verify};
