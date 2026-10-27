import {mkdir,lstat,readdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const valid=name=>/^reading-\d{13}-[a-f0-9-]{36}\.json$/.test(name);
export class AutomaticBackups{
  constructor(library,profile){this.library=library;this.folder=path.join(profile,'reading-backups');this.error='';}
  async directory(){await mkdir(this.folder,{recursive:true});if((await lstat(this.folder)).isSymbolicLink())throw new Error('Backup folder must not be a link.');}
  async list(){await this.directory();const files=[];for(const name of await readdir(this.folder)){if(!valid(name))continue;const info=await lstat(path.join(this.folder,name));if(info.isFile()&&!info.isSymbolicLink())files.push({name,created:Number(name.slice(8,21)),bytes:info.size});}return files.sort((a,b)=>b.created-a.created||b.name.localeCompare(a.name));}
  async read(name){if(!valid(name))throw new Error('Invalid backup name.');await this.directory();const file=path.join(this.folder,name),info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>19*1024*1024)throw new Error('Backup unavailable.');return JSON.parse(await readFile(file,'utf8'));}
  async tick(force=false){if(this.running)return;const prefs=this.library.preferences();if(prefs.incognito||(!force&&!prefs.automaticBackups))return;this.running=true;
    try{const files=await this.list();if(!force&&files[0]&&Date.now()-files[0].created<prefs.backupHours*3600000)return;
      const data=this.library.backup();if(!this.library.root()||!data.books.length)return;
      const name=`reading-${Date.now()}-${randomUUID()}.json`,temporary=path.join(this.folder,name+'.tmp');const bytes=JSON.stringify(data);if(Buffer.byteLength(bytes)>19*1024*1024)throw new Error('Reading-data backup exceeds 19 MB. Export a full profile archive instead.');await writeFile(temporary,bytes,{flag:'wx',mode:0o600});await rename(temporary,path.join(this.folder,name));
      for(const old of (await this.list()).slice(prefs.backupKeep))await unlink(path.join(this.folder,old.name));this.error='';return {name};
    }catch(error){this.error=error.message;throw error;}finally{this.running=false;}
  }
}
