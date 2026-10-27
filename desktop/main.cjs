const {app,BrowserWindow,Menu,ipcMain,shell,dialog,powerSaveBlocker,session:electronSession}=require('electron');
const {existsSync,mkdirSync}=require('node:fs');
const {writeFile}=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {createSourceWindows}=require('./source-session.cjs');
const {connectService}=require('./service.cjs');
const {appPage,externalLink,originalPage,readerState,trustedSender}=require('./policy.cjs');
const {createControls}=require('./controls.cjs');
const {FileQueue,launchFiles,localClient}=require('./files.cjs');
app.setName('Folio Desktop');app.setAppUserModelId('org.folio.localreader');
const profile=path.resolve(process.env.EBOOK_PROFILE||path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share'),'LocalEbookReader'));
// Separate Chromium caches/cookies from reading-data backups; no remote source sessions.
mkdirSync(path.join(profile,'desktop-browser'),{recursive:true});app.setPath('userData',path.join(profile,'desktop-browser'));
if(!app.requestSingleInstanceLock()){app.quit();}else{
  let window,service,controls,sourceWindows,allowClose=false,closing=false,lastState,closeTimer,quitting=false,rendererReadyResolve,smokeResult;
  const rendererReady=new Promise(resolve=>rendererReadyResolve=resolve);
  const smoke=process.env.FOLIO_DESKTOP_SMOKE_REPORT;
  const smokeBook=smoke&&/^[a-f0-9-]{36}$/.test(process.env.FOLIO_DESKTOP_SMOKE_BOOK||'')?process.env.FOLIO_DESKTOP_SMOKE_BOOK:null;
  const smokeFile=smoke&&(launchFiles(process.argv).length>0||process.env.FOLIO_DESKTOP_SMOKE_SECOND_INSTANCE==='1');
  const files=new FileQueue();let filesReady=false;
  const sendFiles=()=>{if(filesReady&&window&&!window.isDestroyed())window.webContents.send('folio:open-files',files.list());};
  async function queueFiles(addresses){for(const address of addresses){try{await files.add(address);}catch(error){if(window&&!smoke)await dialog.showMessageBox(window,{type:'error',message:'The ebook could not be opened.',detail:error.message});}}sendFiles();}
  function stopAwake(){controls?.stopAwake();}
  function applyState(input){lastState=readerState(input);const result=controls.apply(lastState);for(const viewer of BrowserWindow.getAllWindows())if(viewer!==window)viewer.setContentProtection(process.platform==='win32'&&lastState.protectCapture);return result;}
  const trusted=event=>trustedSender(event,window,service?.origin);
  ipcMain.handle('folio:source-session',(event,id)=>{if(!trusted(event)||typeof id!=='string')throw new Error('Desktop action rejected.');return sourceWindows.open(id);});
  ipcMain.on('folio:files-ready',event=>{if(trusted(event)){filesReady=true;sendFiles();}});
  ipcMain.handle('folio:open-file',async(event,id)=>{if(!trusted(event)||typeof id!=='string')throw new Error('Desktop action rejected.');const client=localClient(service.origin,()=>window.webContents.session.cookies.get({url:service.origin}));const result=await files.open(id,client);sendFiles();return result;});
  ipcMain.handle('folio:dismiss-file',(event,id)=>{if(!trusted(event)||typeof id!=='string')throw new Error('Desktop action rejected.');files.dismiss(id);sendFiles();});
  ipcMain.handle('folio:reader',(event,value)=>{if(!trusted(event))throw new Error('Desktop action rejected.');const result=applyState(value);if(!smokeBook&&!smokeFile||value.reading&&value.progress>0)rendererReadyResolve();return result;});
  ipcMain.on('folio:close-ready',event=>{if(trusted(event)&&closing){clearTimeout(closeTimer);if(smokeResult)smokeResult.closeHandshake=true;allowClose=true;window.close();}});
  ipcMain.on('folio:close-failed',async event=>{if(!trusted(event)||!closing)return;clearTimeout(closeTimer);closing=false;await dialog.showMessageBox(window,{type:'error',message:'Your latest reading position could not be saved.',detail:'Folio is staying open. Check the reader error and try closing again.'});});
  app.on('second-instance',(event,argv)=>{void queueFiles(launchFiles(argv));if(window&&!smoke){if(window.isMinimized())window.restore();window.show();window.focus();}});
  app.on('before-quit',event=>{if(quitting)return;event.preventDefault();if(window&&!window.isDestroyed()){window.close();return;}quitting=true;stopAwake();void Promise.resolve(sourceWindows?.stop()).then(()=>service?.stop()).then(async()=>{if(smoke&&smokeResult)await writeFile(path.resolve(smoke),JSON.stringify({...smokeResult,serverReleased:true}));}).finally(()=>app.quit());});
  app.on('window-all-closed',()=>app.quit());
  app.whenReady().then(async()=>{
    const packaged=existsSync(path.resolve(__dirname,'../../folio/app/server.mjs'));
    const appRoot=packaged?path.resolve(__dirname,'../../folio/app'):path.resolve(__dirname,'..');
    const nodeBinary=packaged?path.resolve(__dirname,'../../folio/runtime/node.exe'):process.env.FOLIO_NODE_BINARY;
    if(!nodeBinary)throw new Error('Use the desktop launcher so Folio can locate its Node runtime.');
    service=await connectService({profile,nodeBinary,serverEntry:path.join(appRoot,'server.mjs')});
    window=new BrowserWindow({width:1320,height:900,minWidth:760,minHeight:560,title:'Folio',show:false,backgroundColor:'#ffffff',webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,webviewTag:false,allowRunningInsecureContent:false}});
    const {sourceProxy}=await import(pathToFileURL(path.join(appRoot,'lib/source-proxy.mjs')).href),{resolvePublic}=await import(pathToFileURL(path.join(appRoot,'lib/source-policy.mjs')).href);
    sourceWindows=createSourceWindows({BrowserWindow,Menu,session:electronSession,dialog,client:localClient(service.origin,()=>window.webContents.session.cookies.get({url:service.origin})),sourceProxy,resolvePublic,smoke:!!smoke,onWindow:viewer=>viewer.setContentProtection(process.platform==='win32'&&!!lastState?.protectCapture)});
    controls=createControls({window,powerSaveBlocker,platform:process.platform});
    window.setContentProtection(process.platform==='win32'&&service.captureProtection);
    Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Folio',submenu:[{label:'Open ebook…',accelerator:'CmdOrCtrl+O',click:async()=>{const result=await dialog.showOpenDialog(window,{title:'Open ebook',properties:['openFile'],filters:[{name:'Ebooks',extensions:['pdf','epub','cbz']}]});if(!result.canceled)await queueFiles(result.filePaths);}},{type:'separator'},{role:'reload'},{role:'togglefullscreen'},{type:'separator'},{role:'quit'}]},{label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]}]));
    const session=window.webContents.session;
    session.setPermissionRequestHandler((contents,permission,callback)=>callback(false));session.setPermissionCheckHandler(()=>false);
    session.webRequest.onBeforeRequest((details,callback)=>{let allowed=false;try{const url=new URL(details.url);allowed=url.origin===service.origin||url.protocol==='blob:'&&url.origin===service.origin||url.protocol==='data:'||url.protocol==='chrome-extension:';}catch{}callback({cancel:!allowed});});
    window.webContents.on('will-navigate',(event,address)=>{if(!appPage(address,service.origin))event.preventDefault();});
    window.webContents.on('will-attach-webview',event=>event.preventDefault());
    window.webContents.setWindowOpenHandler(({url})=>{if(originalPage(url,service.origin))return {action:'allow',overrideBrowserWindowOptions:{title:'Folio · Original file',width:1050,height:800,webPreferences:{preload:path.join(__dirname,'viewer-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,webviewTag:false}}};const address=externalLink(url);if(address)void shell.openExternal(address);return {action:'deny'};});
    window.webContents.on('did-create-window',viewer=>{viewer.setContentProtection(process.platform==='win32'&&(lastState?.protectCapture??service.captureProtection));viewer.webContents.setWindowOpenHandler(()=>({action:'deny'}));viewer.webContents.on('will-navigate',(event,url)=>{if(!originalPage(url,service.origin))event.preventDefault();});});
    window.on('blur',stopAwake);window.on('minimize',stopAwake);window.on('focus',()=>{if(lastState)applyState(lastState);});
    window.on('close',event=>{if(allowClose){for(const viewer of BrowserWindow.getAllWindows())if(viewer!==window)viewer.destroy();return;}event.preventDefault();if(closing)return;closing=true;window.webContents.send('folio:closing');closeTimer=setTimeout(async()=>{closing=false;const result=await dialog.showMessageBox(window,{type:'question',buttons:['Keep Folio open','Close window'],defaultId:0,cancelId:0,message:'Folio is still saving your reading position.',detail:'Keep the app open to finish saving. Closing now may lose the most recent changes.'});if(result.response===1){allowClose=true;window.close();}},6000);});
    window.on('closed',()=>{stopAwake();window=null;});
    window.webContents.on('did-start-navigation',(event,url,isInPlace,isMainFrame)=>{if(isMainFrame&&!isInPlace)filesReady=false;});
    await queueFiles(launchFiles(process.argv));
    await window.loadURL(service.origin+(smokeBook?'/#book='+smokeBook+'&page=2':''));
    if(smoke){let timer;try{await Promise.race([rendererReady,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('The desktop bridge did not initialize.')),15000);})]);}finally{clearTimeout(timer);}const sourceSessionTest=process.env.FOLIO_DESKTOP_SMOKE_SOURCE_ID?await sourceWindows.selfTest(process.env.FOLIO_DESKTOP_SMOKE_SOURCE_ID):null;const settings=window.webContents.getLastWebPreferences();const protection=applyState({reading:false,keepAwake:false,protectCapture:true,showProgress:true,progress:0.5});applyState({reading:false,keepAwake:false,protectCapture:false,showProgress:false,progress:0});smokeResult={loaded:appPage(window.webContents.getURL(),service.origin),rendererReady:true,readerOpened:!!smokeBook,fileOpened:!!smokeFile,...(sourceSessionTest?{sourceSession:sourceSessionTest}:{}),ownedServer:service.owned,sandbox:settings.sandbox,contextIsolation:settings.contextIsolation,nodeIntegration:settings.nodeIntegration,captureProtected:protection.captureProtected,origin:service.origin,electron:process.versions.electron};window.close();}
    else window.show();
  }).catch(async error=>{if(smoke)await writeFile(path.resolve(smoke),JSON.stringify({error:error.message}));else dialog.showErrorBox('Folio could not start',error.message);quitting=true;await sourceWindows?.stop();await service?.stop();app.exit(1);});
}
