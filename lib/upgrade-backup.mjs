import {mkdirSync,lstatSync,openSync,closeSync,readSync,writeFileSync,fsyncSync,unlinkSync,rmdirSync,copyFileSync,constants} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {CURRENT_SCHEMA} from './schema.mjs';

const format='folio-upgrade-backup-v1';
const namePattern=/^schema-(\d+)-before-(\d+)-(\d{13})-([a-f0-9-]{36})\.sqlite$/;

function regular(file){const info=lstatSync(file);if(!info.isFile()||info.isSymbolicLink())throw new Error('Upgrade backups must be regular files, without links.');return info;}
function digest(file){
  regular(file);const fd=openSync(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  try{const hash=createHash('sha256'),buffer=Buffer.alloc(256*1024);let size=0,count;while((count=readSync(fd,buffer,0,buffer.length,null))>0){hash.update(buffer.subarray(0,count));size+=count;}return {size,sha256:hash.digest('hex')};}finally{closeSync(fd);}
}
function checkDatabase(file,version){const db=new DatabaseSync(file,{readOnly:true});try{if(db.prepare('PRAGMA user_version').get().user_version!==version||db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('The upgrade backup failed database verification.');}finally{db.close();}}

// VACUUM INTO includes committed WAL data and leaves the source's schema intact.
// The caller checks data_version after acquiring its migration write lock.
export function createUpgradeBackup(db,file,from,to){
  if(file===':memory:')return null;
  const directory=path.join(path.dirname(path.resolve(file)),'upgrade-backups');
  let snapshot,manifest,ownsSnapshot=false,ownsManifest=false,manifestFd;
  try{
    regular(file);mkdirSync(directory,{recursive:true,mode:0o700});
    const folder=lstatSync(directory);if(!folder.isDirectory()||folder.isSymbolicLink())throw new Error('The upgrade-backups folder must not be a link.');
    const created=Date.now(),name=`schema-${from}-before-${to}-${created}-${randomUUID()}.sqlite`;
    snapshot=path.join(directory,name);manifest=snapshot+'.json';
    // Reserve a private empty file; SQLite refuses any existing nonempty target.
    closeSync(openSync(snapshot,'wx',0o600));ownsSnapshot=true;
    db.exec('PRAGMA synchronous=FULL');db.prepare('VACUUM main INTO ?').run(snapshot);
    checkDatabase(snapshot,from);
    const fd=openSync(snapshot,'r+');try{fsyncSync(fd);}finally{closeSync(fd);}
    const data={format,file:name,from,to,created,...digest(snapshot)};
    manifestFd=openSync(manifest,'wx',0o600);ownsManifest=true;
    writeFileSync(manifestFd,JSON.stringify(data,null,2)+'\n');fsyncSync(manifestFd);closeSync(manifestFd);manifestFd=undefined;
    verifyUpgradeBackup(snapshot);
    return {...data,file:snapshot,manifest};
  }catch(error){
    if(manifestFd!==undefined)try{closeSync(manifestFd);}catch{}
    for(const owned of [ownsManifest&&manifest,ownsSnapshot&&snapshot])if(owned)try{unlinkSync(owned);}catch{}
    throw new Error('Folio could not save and verify a backup before upgrading this profile. Its database format was not changed. Check free space and permissions, then try again. '+error.message,{cause:error});
  }
}

export function verifyUpgradeBackup(file){
  const snapshot=path.resolve(file),name=path.basename(snapshot),match=namePattern.exec(name);
  if(!match)throw new Error('Choose a schema backup from the profile upgrade-backups folder.');
  const manifest=snapshot+'.json';if(regular(manifest).size>16384)throw new Error('Invalid upgrade backup manifest.');
  const fd=openSync(manifest,constants.O_RDONLY|(constants.O_NOFOLLOW||0));let metadata;
  try{const bytes=Buffer.alloc(16385),length=readSync(fd,bytes,0,bytes.length,0);if(length>16384)throw new Error('Invalid upgrade backup manifest.');metadata=JSON.parse(bytes.subarray(0,length));}finally{closeSync(fd);}
  if(metadata.format!==format||metadata.file!==name||metadata.from!==Number(match[1])||metadata.to!==Number(match[2])||metadata.created!==Number(match[3])||!Number.isSafeInteger(metadata.from)||metadata.from<0||!Number.isSafeInteger(metadata.to)||metadata.to<=metadata.from||metadata.from>CURRENT_SCHEMA||!Number.isSafeInteger(metadata.size)||metadata.size<1||!/^[a-f0-9]{64}$/.test(metadata.sha256))throw new Error('Invalid or unsupported upgrade backup manifest.');
  const actual=digest(snapshot);if(actual.size!==metadata.size||actual.sha256!==metadata.sha256)throw new Error('Upgrade backup checksum verification failed.');
  checkDatabase(snapshot,metadata.from);return {...metadata,snapshot};
}

// Recovery always creates a separate profile. Never overwrite the working profile.
export function recoverUpgradeBackup(file,destination){
  const metadata=verifyUpgradeBackup(file),target=path.resolve(destination),database=path.join(target,'library.sqlite');
  if(target===path.dirname(target))throw new Error('Choose a new, dedicated profile directory.');
  mkdirSync(target,{mode:0o700});
  try{
    copyFileSync(metadata.snapshot,database,constants.COPYFILE_EXCL);
    const actual=digest(database);if(actual.sha256!==metadata.sha256||actual.size!==metadata.size)throw new Error('The backup changed while copying.');
    checkDatabase(database,metadata.from);
    const fd=openSync(database,'r+');try{fsyncSync(fd);}finally{closeSync(fd);}
    return {profile:target,schema:metadata.from,sha256:metadata.sha256};
  }catch(error){try{unlinkSync(database);}catch{}try{rmdirSync(target);}catch{}throw error;}
}
