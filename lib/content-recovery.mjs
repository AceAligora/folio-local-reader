import {createHash,randomUUID} from 'node:crypto';
import {hashBook,inspectBook} from './verified-file.mjs';
import {excludedSource} from './scan-policy.mjs';
import {validateState} from './backup.mjs';

const describe=book=>({id:book.id,root:book.root,source:book.source,title:book.state.metadata?.title||book.title,format:book.format,page:(book.state.page||0)+1,notes:book.state.notes?.length||0,bookmarks:book.state.bookmarks?.length||0});
const empty=()=>({running:false,status:'Not prepared',checked:0,bytes:0,reused:0,remembered:0,matches:[],issues:[],stale:false});
export class ContentRecovery {
  constructor(library,{maxFiles=200,maxBytes=2*1024**3}={}){Object.assign(this,{library,maxFiles,maxBytes});this.job=empty();}
  cancel(){this.cancelled=true;}
  guard(){if(this.library.preferences().incognito)throw new Error('Leave Incognito to prepare or recover reading data.');if(this.library.job.running)throw new Error('Wait for the library scan to finish.');}
  files(){return this.library.db.prepare("SELECT books.*,bookmeta.signature FROM books JOIN bookmeta ON bookmeta.id=books.id WHERE books.root=? AND available=1 AND format IN ('pdf','epub','cbz') ORDER BY source").all(this.library.root()).filter(book=>!excludedSource(book.source,this.library.preferences().excludedFolders));}
  fingerprint(id){return this.library.db.prepare('SELECT * FROM recovery_fingerprints WHERE book=?').get(id);}
  valid(book,fingerprint){return fingerprint&&book&&book.root===fingerprint.root&&book.source===fingerprint.source&&book.format===fingerprint.format&&book.signature===fingerprint.signature;}
  row(id){const row=this.library.db.prepare('SELECT books.*,bookmeta.signature FROM books JOIN bookmeta ON bookmeta.id=books.id WHERE books.id=?').get(id);return row&&this.library.decode(row);}
  pair(fromId,toId){
    this.guard();const from=this.row(fromId),to=this.row(toId),a=this.fingerprint(fromId),b=this.fingerprint(toId),root=this.library.root(),excluded=this.library.preferences().excludedFolders;
    if(!from||!to||fromId===toId||to.root!==root||!to.available||from.root===root&&from.available||excludedSource(from.source,excluded)||excludedSource(to.source,excluded)||!this.valid(from,a)||!this.valid(to,b)||a.sha256!==b.sha256||a.size!==b.size||from.format!==to.format)throw new Error('Choose a remembered missing or previous-library record and its verified matching copy. Prepare fingerprints again if files changed.');
    return {from,to,a,b};
  }
  matches(){
    const root=this.library.root(),excluded=this.library.preferences().excludedFolders;
    const pairs=this.library.db.prepare(`SELECT a.book AS original,b.book AS replacement FROM recovery_fingerprints a
      JOIN recovery_fingerprints b ON a.sha256=b.sha256 AND a.size=b.size AND a.format=b.format
      JOIN books old ON old.id=a.book JOIN bookmeta oldmeta ON oldmeta.id=old.id
      JOIN books current ON current.id=b.book JOIN bookmeta currentmeta ON currentmeta.id=current.id
      WHERE current.root=? AND current.available=1 AND old.id!=current.id AND (old.root!=? OR old.available=0)
      AND old.root=a.root AND old.source=a.source AND old.format=a.format AND oldmeta.signature=a.signature
      AND current.root=b.root AND current.source=b.source AND current.format=b.format AND currentmeta.signature=b.signature
      LIMIT 1000`).all(root,root);
    return pairs.flatMap(pair=>{const from=this.row(pair.original),to=this.row(pair.replacement);if(excludedSource(from.source,excluded)||excludedSource(to.source,excluded))return [];const a=this.fingerprint(from.id);return [{from:describe(from),to:describe(to),sha256:a.sha256,rememberedAt:a.checked}];}).slice(0,200);
  }
  result(){
    if(this.library.preferences().incognito)return empty();
    const files=this.files(),remembered=files.filter(book=>this.valid(book,this.fingerprint(book.id))).length;
    return {...this.job,running:this.job.running||!!this.busy,remembered,matches:this.matches(),stale:this.root!==undefined&&(this.root!==this.library.root()||this.scanFinishedAt!==(this.library.job.finishedAt||0))};
  }
  async run(){
    this.guard();if(this.job.running||this.busy)throw new Error('A content recovery check is already running.');
    this.root=this.library.root();this.scanFinishedAt=this.library.job.finishedAt||0;this.cancelled=false;this.job={...empty(),running:true,status:'Remembering file contents'};
    const exclusions=JSON.stringify(this.library.preferences().excludedFolders);
    const active=()=>!this.cancelled&&!this.library.preferences().incognito&&!this.library.job.running&&this.root===this.library.root()&&this.scanFinishedAt===(this.library.job.finishedAt||0)&&exclusions===JSON.stringify(this.library.preferences().excludedFolders);
    try {
      for(const book of this.files()){
        if(!active())break;
        try {
          const before=await inspectBook(this.library,book.id),saved=this.fingerprint(book.id);
          if(!active())break;
          if(this.valid(book,saved)&&before.stamp===saved.stamp){this.job.reused++;continue;}
          if(this.job.checked>=this.maxFiles){this.job.limited=true;break;}
          if(before.size>this.maxBytes-this.job.bytes){this.job.limited=true;continue;}
          this.job.checked++;
          const result=await hashBook(this.library,book.id,{maxBytes:this.maxBytes-this.job.bytes,active,onBytes:bytes=>this.job.bytes+=bytes});
          if(!active())break;
          const current=this.row(book.id);if(current.root!==book.root||current.source!==book.source||current.signature!==book.signature)throw new Error('Library changed; scan and prepare again.');
          this.library.db.prepare('INSERT OR REPLACE INTO recovery_fingerprints VALUES(?,?,?,?,?,?,?,?,?)').run(book.id,book.root,book.source,book.format,book.signature,result.size,result.stamp,result.sha256,Date.now());
        }catch(error){if(this.job.issues.length<50)this.job.issues.push({source:book.source,message:error.message});}
      }
      this.job.status=!active()?'Cancelled':this.job.limited?'Partial preparation — run again to continue':'Fingerprints prepared';
    }finally{this.job.running=false;this.job.finishedAt=Date.now();}
    return this.result();
  }
  plan(pair){
    const {from,to,a,b}=pair;
    const reading=this.library.db.prepare('SELECT book,seconds FROM reading WHERE book IN (?,?) ORDER BY book').all(from.id,to.id);
    const collections=this.library.db.prepare('SELECT value FROM config WHERE key=?').get('collections')?.value||'[]';
    const token=createHash('sha256').update(JSON.stringify({root:this.library.root(),from,to,a,b,reading,collections,exclusions:this.library.preferences().excludedFolders})).digest('hex');
    return {from:describe(from),to:describe(to),sha256:a.sha256,rememberedAt:a.checked,token};
  }
  async preview(fromId,toId){
    if(this.job.running||this.busy)throw new Error('Wait for the content check to finish.');
    const pair=this.pair(fromId,toId),current=await inspectBook(this.library,toId);
    if(current.stamp!==pair.b.stamp)throw new Error('The replacement changed. Scan and prepare fingerprints again.');
    return this.plan(this.pair(fromId,toId));
  }
  async apply(fromId,toId,token,saveSafety){
    if(this.job.running||this.busy)throw new Error('Wait for the content check to finish.');
    let pair=this.pair(fromId,toId);
    if(typeof token!=='string'||token!==this.plan(pair).token)throw new Error('Reading data changed or has not been reviewed. Review again.');
    this.busy=true;this.cancelled=false;const root=this.library.root();
    const active=()=>!this.cancelled&&!this.library.preferences().incognito&&!this.library.job.running&&root===this.library.root();
    try {
      const checked=await hashBook(this.library,toId,{maxBytes:this.maxBytes,active});
      if(checked.sha256!==pair.a.sha256||checked.stamp!==pair.b.stamp)throw new Error('The replacement changed. Scan and prepare fingerprints again.');
      if(!active()||this.plan(this.pair(fromId,toId)).token!==token)throw new Error('Reading data changed. Review again.');
      const safetyBackup=await saveSafety(this.library.backup());
      const current=await inspectBook(this.library,toId);
      pair=this.pair(fromId,toId);
      if(!active()||current.stamp!==checked.stamp||this.plan(pair).token!==token)throw new Error('The library or reading data changed. Review again.');
      this.transfer(pair);
      return {id:toId,safetyBackup};
    }finally{this.busy=false;}
  }
  transfer({from,to}){
    const state=validateState({...to.state,...from.state,
      notes:[...new Map([...(to.state.notes||[]),...(from.state.notes||[])].map(note=>[note.id,note])).values()],
      bookmarks:[...new Map([...(to.state.bookmarks||[]),...(from.state.bookmarks||[])].map(mark=>[mark.page+':'+mark.label,mark])).values()],
      tags:[...new Set([...(to.state.tags||[]),...(from.state.tags||[])])]});
    const db=this.library.db;db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE books SET state=? WHERE id=?').run(JSON.stringify(state),to.id);
      if(from.root===to.root&&Number.isInteger(from.state.queueRank)){const retained={...from.state};delete retained.queueRank;db.prepare('UPDATE books SET state=? WHERE id=?').run(JSON.stringify(retained),from.id);}
      const time=db.prepare('SELECT seconds FROM reading WHERE book=?').get(from.id);
      if(time)db.prepare('INSERT INTO reading VALUES(?,?) ON CONFLICT(book) DO UPDATE SET seconds=MAX(seconds,excluded.seconds)').run(to.id,time.seconds);
      if(from.root===to.root)db.prepare('DELETE FROM reading WHERE book=?').run(from.id);
      const collections=JSON.parse(db.prepare('SELECT value FROM config WHERE key=?').get('collections')?.value||'[]');
      for(const collection of [...collections].filter(c=>c.root===from.root&&c.books.includes(from.id))){
        if(from.root===to.root){collection.books=[...new Set(collection.books.map(id=>id===from.id?to.id:id))];continue;}
        const link=db.prepare('SELECT target FROM recovery_collection_links WHERE source=? AND root=?').get(collection.id,to.root);
        let target=link&&collections.find(c=>c.id===link.target&&c.root===to.root);
        if(!target){
          let name=collection.name;for(let index=1;collections.some(c=>c.root===to.root&&c.name.toLowerCase()===name.toLowerCase());index++)name=collection.name.slice(0,55)+' (recovered '+index+')';
          target={id:randomUUID(),root:to.root,name,books:[]};collections.push(target);
          db.prepare('INSERT OR REPLACE INTO recovery_collection_links VALUES(?,?,?)').run(collection.id,to.root,target.id);
        }
        target.books=[...new Set([...target.books,to.id])];
      }
      db.prepare('INSERT OR REPLACE INTO config VALUES(?,?)').run('collections',JSON.stringify(collections));
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
}
