const {contextBridge,ipcRenderer}=require('electron');
// No filesystem, shell, arbitrary IPC or URLs are exposed to the page/ebook frames.
if(process.isMainFrame){
  let beforeClose=async()=>{},openFiles=()=>{};
  ipcRenderer.on('folio:closing',async()=>{try{await beforeClose();ipcRenderer.send('folio:close-ready');}catch{ipcRenderer.send('folio:close-failed');}});
  ipcRenderer.on('folio:open-files',(event,files)=>openFiles(files));
  contextBridge.exposeInMainWorld('folioDesktop',{
    capabilities:Object.freeze({apiVersion:1,platform:process.platform,captureProtection:process.platform==='win32',taskbarProgress:process.platform==='win32',fileOpen:true,sourceSessions:true}),
    syncReader:state=>ipcRenderer.invoke('folio:reader',state),
    onClosing:callback=>{if(typeof callback==='function')beforeClose=callback;},
    onOpenFiles:callback=>{if(typeof callback==='function'){openFiles=callback;ipcRenderer.send('folio:files-ready');}},
    openSourceSession:id=>ipcRenderer.invoke('folio:source-session',id),
    openFile:id=>ipcRenderer.invoke('folio:open-file',id),
    dismissFile:id=>ipcRenderer.invoke('folio:dismiss-file',id)
  });
}
