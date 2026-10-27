import {watch} from 'node:fs';
import {excludedSource} from './scan-policy.mjs';

// Events are hints: the normal scanner remains responsible for all path checks.
export class LibraryWatcher{
  constructor(library,{watchImpl=watch,delay=800,maxDelay=4000,retry=15000}={}){Object.assign(this,{library,watchImpl,delay,maxDelay,retry});this.status='Off';this.root='';this.closed=false;}
  reconcile(){
    if(this.closed)return;
    const prefs=this.library.preferences(),root=prefs.watchLibrary&&!prefs.incognito?this.library.root():'';
    if(this.root!==root){this.stop();this.root=root;this.nextRetry=0;}
    if(!root){this.status='Off';return;}
    if(this.watcher||Date.now()<(this.nextRetry||0))return;
    try{this.watcher=this.watchImpl(root,{recursive:true},(event,filename)=>{
      const preferences=this.library.preferences();if(!preferences.watchLibrary||preferences.incognito||this.root!==this.library.root())return;
      const source=filename?.toString()||'';
      if(source&&excludedSource(source,preferences.excludedFolders))return;
      if(event==='change'&&source&&!/\.(pdf|epub|cbz|png|jpe?g|webp|gif)$/i.test(source))return;
      this.pending=true;this.firstEvent??=Date.now();this.status='Changes pending';
      clearTimeout(this.timer);this.timer=setTimeout(()=>void this.flush(),Math.min(this.delay,Math.max(0,this.maxDelay-(Date.now()-this.firstEvent))));this.timer.unref?.();
    });this.watcher.on('error',()=>{this.stop();this.nextRetry=Date.now()+this.retry;this.status='Folder watching unavailable; periodic refresh and manual scans remain available';});this.watcher.unref?.();this.status='Watching local folder';}
    catch{this.nextRetry=Date.now()+this.retry;this.status='Folder watching unavailable; periodic refresh and manual scans remain available';}
  }
  async flush(){
    this.timer=null;this.reconcile();if(!this.pending||!this.watcher)return;
    if(this.library.job.running){this.timer=setTimeout(()=>void this.flush(),this.delay);this.timer.unref?.();return;}
    this.pending=false;this.firstEvent=null;this.status='Refreshing local changes';
    try{await this.library.scan();}catch{this.status='Could not refresh; try a manual scan';return;}
    if(!this.pending&&this.watcher)this.status='Watching local folder';
  }
  stop(){clearTimeout(this.timer);this.timer=null;this.watcher?.close();this.watcher=null;this.pending=false;this.firstEvent=null;}
  close(){this.closed=true;this.stop();this.status='Off';}
}
