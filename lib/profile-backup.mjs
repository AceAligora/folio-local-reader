import {mkdir,readFile,writeFile,readdir,lstat,rm,rename,realpath} from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {zipSync,unzipSync,strToU8,strFromU8} from '../public/vendor/fflate/esm/browser.js';
import {CURRENT_SCHEMA} from './schema.mjs';
const MAX=256*1024*1024;
const allowed=name=>name==='library.sqlite'||/^custom-covers\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(name)||/^extension-packages\/[a-f0-9-]{36}\.apk$/.test(name);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function exportProfile(library,profile){
  if(library.job.running)throw new Error('Wait for the scan to finish before exporting a full profile.');
  const directory=path.resolve(profile,'backup-temp'),snapshot=path.join(directory,crypto.randomUUID()+'.sqlite');await mkdir(directory,{recursive:true});
  try{library.db.exec("VACUUM INTO '"+snapshot.replaceAll("'","''")+"'");if((await lstat(snapshot)).size>MAX)throw new Error('The profile database exceeds the 256 MB archive limit.');const files={'library.sqlite':await readFile(snapshot)};let size=files['library.sqlite'].length;
    for(const folder of ['custom-covers','extension-packages']){const base=path.resolve(profile,folder);let entries;try{entries=await readdir(base,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')continue;throw error;}if((await lstat(base)).isSymbolicLink())throw new Error('Profile asset links cannot be exported.');for(const entry of entries){const name=folder+'/'+entry.name;if(!allowed(name))continue;const filename=path.join(base,entry.name),info=await lstat(filename);if(!info.isFile()||info.isSymbolicLink())throw new Error('Profile asset links cannot be exported.');size+=info.size;if(size>MAX)throw new Error('This profile exceeds the 256 MB archive limit. Keep an offline filesystem backup for larger profiles.');files[name]=await readFile(filename);}}
    const manifest={format:'folio-profile-v1',created:Date.now(),files:Object.entries(files).map(([name,bytes])=>({name,size:bytes.length,sha256:sha(bytes)}))};files['manifest.json']=strToU8(JSON.stringify(manifest));return zipSync(files,{level:3});
  }finally{await rm(snapshot,{force:true});}
}
export function unpackProfile(bytes){
  if(bytes.length>MAX)throw new Error('Profile archives must be smaller than 256 MB.');let total=0,count=0;
  const files=unzipSync(bytes,{filter(entry){total+=entry.originalSize;if(++count>5000||total>MAX||entry.originalSize>MAX||!allowed(entry.name)&&entry.name!=='manifest.json')throw new Error('Invalid profile archive contents.');return true;}});
  const manifest=JSON.parse(strFromU8(files['manifest.json']||new Uint8Array()));if(manifest.format!=='folio-profile-v1'||!Array.isArray(manifest.files)||!files['library.sqlite'])throw new Error('Choose a Folio full-profile archive.');
  const names=new Set();for(const item of manifest.files){if(!allowed(item.name)||names.has(item.name)||!files[item.name]||files[item.name].length!==item.size||sha(files[item.name])!==item.sha256)throw new Error('Profile archive verification failed.');names.add(item.name);}if(names.size!==Object.keys(files).length-1)throw new Error('Profile archive manifest does not match its files.');return files;
}
export async function restoreProfile(bytes,target,{libraryRoot}={}){
  const destination=path.resolve(target),parent=path.dirname(destination);
  if(destination===parent||destination.length<10)throw new Error('Choose a dedicated Folio profile directory.');
  // An existing destination must identify itself as a Folio profile.
  let exists=false;try{const info=await lstat(destination);exists=true;if(!info.isDirectory()||info.isSymbolicLink())throw new Error('Choose a regular profile directory.');await lstat(path.join(destination,'library.sqlite'));}catch(error){if(error.code!=='ENOENT')throw error;if(exists)throw new Error('The destination is not an existing Folio profile.');}
  try{const runtime=JSON.parse(await readFile(path.join(destination,'server-runtime.json'),'utf8'));try{process.kill(runtime.pid,0);throw new Error('Stop Folio before restoring its profile.');}catch(error){if(error.code!=='ESRCH')throw error;}}catch(error){if(error.code!=='ENOENT')throw error;}
  const files=unpackProfile(bytes);await mkdir(parent,{recursive:true});const stage=path.join(parent,'.folio-restore-'+crypto.randomUUID()),safety=destination+'.before-restore-'+Date.now();
  // Every extracted destination is from the strict allowlist above and remains under this owned stage.
  await mkdir(stage);
  try{for(const [name,bytes]of Object.entries(files)){if(name==='manifest.json')continue;const file=path.resolve(stage,...name.split('/'));if(!file.startsWith(stage+path.sep))throw new Error('Invalid profile asset path.');await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes,{flag:'wx'});}
    const db=new DatabaseSync(path.join(stage,'library.sqlite'));try{if(db.prepare('PRAGMA user_version').get().user_version>CURRENT_SCHEMA)throw new Error('This backup requires a newer Folio version.');if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('The backup database failed its integrity check.');if(libraryRoot){const resolved=await realpath(libraryRoot);if(!(await lstat(resolved)).isDirectory())throw new Error('Choose a library folder.');const old=db.prepare('SELECT value FROM config WHERE key=?').get('root')?.value;db.prepare('UPDATE books SET root=? WHERE root=?').run(resolved,old);if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='serial_feeds'").get())db.prepare('UPDATE serial_feeds SET root=? WHERE root=?').run(resolved,old);db.prepare('INSERT OR REPLACE INTO config VALUES(?,?)').run('root',resolved);const collections=JSON.parse(db.prepare('SELECT value FROM config WHERE key=?').get('collections')?.value||'[]');db.prepare('INSERT OR REPLACE INTO config VALUES(?,?)').run('collections',JSON.stringify(collections.map(c=>c.root===old?{...c,root:resolved}:c)));}db.exec('PRAGMA wal_checkpoint(TRUNCATE)');}finally{db.close();}
    if(exists)await rename(destination,safety);try{await rename(stage,destination);}catch(error){if(exists)await rename(safety,destination);throw error;}return {destination,safety:exists?safety:null};
  }finally{await rm(stage,{recursive:true,force:true});}
}
