import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,access} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';
import policy from '../desktop/policy.cjs';import {createControls} from '../desktop/controls.cjs';import {connectService,verify} from '../desktop/service.cjs';
import {Library} from '../lib/library.mjs';import {restoreBackup} from '../lib/backup.mjs';
const state={reading:true,keepAwake:true,protectCapture:true,showProgress:true,progress:0.5};
test('desktop bridge accepts only the exact local main frame and a bounded reader-state contract',()=>{
  const origin='http://127.0.0.1:4317';assert.equal(policy.localOrigin(origin),origin);
  for(const address of ['https://127.0.0.1:4317','http://localhost:4317','http://127.0.0.1:4317/path','http://user@127.0.0.1:4317','http://127.0.0.1:4317/?x=1','http://127.0.0.1:0'])assert.equal(policy.localOrigin(address),null,address);
  assert.equal(policy.appPage(origin+'/#book=sample',origin),true);assert.equal(policy.appPage(origin+'/content/file',origin),false);
  assert.equal(policy.externalLink('https://openlibrary.org/works/OL1W'),'https://openlibrary.org/works/OL1W');for(const address of ['file:///C:/secret','javascript:alert(1)','http://127.0.0.1/','https://user:password@example.com'])assert.equal(policy.externalLink(address),null);
  assert.equal(policy.originalPage(origin+'/content/12345678-1234-1234-1234-123456789012',origin),true);assert.equal(policy.originalPage(origin+'/api/backup',origin),false);
  assert.deepEqual(policy.readerState(state),state);for(const input of [{...state,progress:2},{...state,progress:NaN},{...state,reading:1},{...state,path:'C:/secret'},null])assert.throws(()=>policy.readerState(input));
  const frame={url:origin+'/'},contents={mainFrame:frame},window={webContents:contents,isDestroyed:()=>false};assert.equal(policy.trustedSender({sender:contents,senderFrame:frame},window,origin),true);assert.equal(policy.trustedSender({sender:contents,senderFrame:{url:origin+'/'}},window,origin),false);assert.equal(policy.trustedSender({sender:{},senderFrame:frame},window,origin),false);frame.url='https://example.com';assert.equal(policy.trustedSender({sender:contents,senderFrame:frame},window,origin),false);
});
test('native controls release display wake blockers on blur/minimize/reading exit and suppress inactive progress',()=>{
  let focused=true,minimized=false,protectedWindow=false,progress,started=0,stopped=0;
  const window={setContentProtection:value=>protectedWindow=value,isContentProtected:()=>protectedWindow,setProgressBar:value=>progress=value,isFocused:()=>focused,isMinimized:()=>minimized},powerSaveBlocker={start:type=>{assert.equal(type,'prevent-display-sleep');return ++started;},stop:id=>{assert.ok(id>0);stopped++;}};
  const controls=createControls({window,powerSaveBlocker,platform:'win32'});assert.deepEqual(controls.apply(state),{captureProtected:true,keepAwake:true});assert.equal(progress,0.5);controls.apply(state);assert.equal(started,1);
  focused=false;controls.stopAwake();controls.apply(state);assert.equal(stopped,1);assert.equal(started,1);focused=true;controls.resume();assert.equal(started,2);
  minimized=true;controls.apply(state);assert.equal(stopped,2);minimized=false;controls.apply({...state,reading:false});assert.equal(progress,-1);assert.equal(started,2);
  controls.apply({...state,keepAwake:false,protectCapture:false,showProgress:false});assert.equal(protectedWindow,false);assert.equal(progress,-1);controls.stopAwake();assert.equal(stopped,2);
});
test('desktop service owns only its new server, verifies reused profiles, respects app lock and shuts down cleanly',async()=>{
  const profile=await mkdtemp(path.join(os.tmpdir(),'folio-desktop-service-'));let owner;
  try{
    owner=await connectService({profile,nodeBinary:process.execPath,serverEntry:fileURLToPath(new URL('../server.mjs',import.meta.url))});assert.equal(owner.owned,true);assert.ok(policy.localOrigin(owner.origin));
    const runtime=JSON.parse(await readFile(path.join(profile,'server-runtime.json'),'utf8'));assert.equal(runtime.instance,owner.instance);assert.equal(runtime.origin,owner.origin);
    const reused=await connectService({profile,nodeBinary:'unused',serverEntry:'unused'});assert.equal(reused.owned,false);await reused.stop();assert.equal((await fetch(owner.origin)).status,200);
    await assert.rejects(()=>verify(owner.origin,'0'.repeat(64)),/does not match/);
    const home=await fetch(owner.origin),cookie=home.headers.get('set-cookie').split(';')[0];const setup=await fetch(owner.origin+'/api/lock/setup',{method:'POST',headers:{Cookie:cookie,Origin:owner.origin,'Content-Type':'application/json'},body:JSON.stringify({password:'isolated desktop test password'})});assert.equal(setup.status,200);
    assert.equal((await fetch(owner.origin+'/api/books',{headers:{Cookie:cookie}})).status,423);assert.equal((await verify(owner.origin,owner.instance)).origin,owner.origin);
    await owner.stop();owner=null;await assert.rejects(()=>access(path.join(profile,'server-runtime.json')));
    const library=new Library(path.join(profile,'library.sqlite'));assert.equal(library.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');library.preferences({desktopCaptureProtection:true});const backup=library.backup();backup.preferences.desktopCaptureProtection=false;restoreBackup(library,backup,{preferences:true});assert.equal(library.preferences().desktopCaptureProtection,true);library.close();
  }finally{await owner?.stop();await rm(profile,{recursive:true,force:true});}
});
test('desktop service rejects live mismatched runtime records and cleans startup failures',async()=>{
  const profile=await mkdtemp(path.join(os.tmpdir(),'folio-desktop-reject-'));try{
    await writeFile(path.join(profile,'server-runtime.json'),JSON.stringify({pid:process.pid,origin:'https://example.com',instance:'0'.repeat(64)}));await assert.rejects(()=>connectService({profile,nodeBinary:'unused',serverEntry:'unused'}),/running Folio server needs an update/);
    await rm(path.join(profile,'server-runtime.json'));await assert.rejects(()=>connectService({profile,nodeBinary:path.join(profile,'missing.exe'),serverEntry:'unused'}),/ENOENT/);
  }finally{await rm(profile,{recursive:true,force:true});}
});
