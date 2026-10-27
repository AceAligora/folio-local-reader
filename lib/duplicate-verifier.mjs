import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';

// On-demand, bounded reads only. No original file or reading data is changed.
export class DuplicateVerifier{
  constructor(library,{maxFiles=200,maxBytes=2*1024**3}={}){Object.assign(this,{library,maxFiles,maxBytes});this.job={running:false,status:'Not checked',checked:0,bytes:0,groups:[],issues:[]};}
  cancel(){this.cancelled=true;}
  result(){return this.root===this.library.root()&&!this.library.preferences().incognito?{...this.job,stale:this.scanFinishedAt!==(this.library.job.finishedAt||0)}:{running:false,status:'Not checked',checked:0,bytes:0,groups:[],issues:[]};}
  async run(){
    if(this.job.running)throw new Error('A duplicate check is already running.');
    if(this.library.preferences().incognito)throw new Error('Leave Incognito to check duplicates.');
    if(this.library.job.running)throw new Error('Wait for the library scan to finish.');
    this.root=this.library.root();this.scanFinishedAt=this.library.job.finishedAt||0;this.cancelled=false;
    this.job={running:true,status:'Checking file contents',checked:0,bytes:0,groups:[],issues:[]};
    const groups=new Map(),buffer=Buffer.alloc(256*1024);
    const active=()=>!this.cancelled&&this.root===this.library.root()&&!this.library.preferences().incognito;
    try{
      const candidates=this.library.duplicateCandidates().flat();
      for(const book of candidates){
        if(!active())break;
        if(this.job.checked>=this.maxFiles){this.job.limited=true;break;}
        let handle;
        try{
          const file=await this.library.content(book.id);handle=await open(file,constants.O_RDONLY|constants.O_NONBLOCK|(constants.O_NOFOLLOW||0));const before=await handle.stat({bigint:true});
          if(!before.isFile())throw new Error('Not a regular file.');
          if(before.size>BigInt(this.maxBytes-this.job.bytes)){this.job.limited=true;break;}
          const hash=createHash('sha256');let offset=0;
          while(active()){
            if(this.job.bytes>=this.maxBytes){this.job.limited=true;break;}
            const {bytesRead}=await handle.read(buffer,0,Math.min(buffer.length,this.maxBytes-this.job.bytes),offset);
            if(!bytesRead)break;offset+=bytesRead;this.job.bytes+=bytesRead;hash.update(buffer.subarray(0,bytesRead));
          }
          if(!active())break;
          const after=await handle.stat({bigint:true});
          if(BigInt(offset)!==before.size||before.size!==after.size||before.mtimeNs!==after.mtimeNs||before.ctimeNs!==after.ctimeNs)throw new Error('File changed during verification; scan and try again.');
          const current=await this.library.content(book.id);const pathHandle=await open(current,constants.O_RDONLY|constants.O_NONBLOCK|(constants.O_NOFOLLOW||0));try{const now=await pathHandle.stat({bigint:true});if(now.dev!==after.dev||now.ino!==after.ino||now.size!==after.size||now.mtimeNs!==after.mtimeNs||now.ctimeNs!==after.ctimeNs)throw new Error('File changed during verification; scan and try again.');}finally{await pathHandle.close();}
          const key=this.library.book(book.id).format+':'+hash.digest('hex');if(!groups.has(key))groups.set(key,[]);groups.get(key).push({id:book.id,title:this.library.book(book.id).title,source:this.library.book(book.id).source});this.job.checked++;
        }catch(error){if(this.job.issues.length<50)this.job.issues.push({source:book.source,message:error.message});this.job.checked++;}
        finally{await handle?.close();}
        if(this.job.limited)break;
      }
      this.job.groups=[...groups.values()].filter(group=>group.length>1);
      this.job.status=!active()?'Cancelled':this.job.limited?'Partial check — read limit reached':'Check complete';
      if(this.root!==this.library.root()||this.library.preferences().incognito)this.job.groups=[];
    }finally{this.job.running=false;this.job.finishedAt=Date.now();}
    return this.job;
  }
}
