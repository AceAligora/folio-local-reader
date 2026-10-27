import {mkdir,realpath,lstat,rename,rm,open,cp} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {inside} from './library.mjs';

// Stage complete batches outside the library; never overwrite an existing book.
export class Imports {
  constructor(library,profile){this.library=library;this.base=path.join(profile,'imports');this.batches=new Map();}
  async begin(){
    if(!this.library.root())throw new Error('Choose your library folder first.');
    if(this.library.job.running)throw new Error('Wait for the library scan to finish.');
    if(this.batches.size>=3)throw new Error('Finish or cancel your current import first.');
    const id=randomUUID(),directory=path.join(this.base,id);
    await mkdir(directory,{recursive:true});
    this.batches.set(id,{directory,root:this.library.root(),files:0,busy:false});return {id};
  }
  async upload(id,name,stream){
    const batch=this.batches.get(id);
    if(!batch||batch.busy)throw new Error('Import is unavailable.');
    const parts=String(name).split('/');
    if(parts.length>30||parts.some(p=>!p||p==='.'||p==='..'||/[\\<>:"|?*\x00-\x1f]/.test(p)||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(p))||name.length>1000)throw new Error('Invalid file name.');
    if(!/\.(pdf|epub|cbz|png|jpe?g|webp|gif)$/i.test(name))throw new Error('Choose PDF, EPUB, CBZ or image files.');
    if(batch.files>=10000)throw new Error('Import up to 10,000 files at a time.');
    batch.busy=true;let file;const target=path.join(batch.directory,...parts);
    try{
      await mkdir(path.dirname(target),{recursive:true});file=await open(target,'wx');let size=0;
      for await(const chunk of stream){size+=chunk.length;if(size>1024*1024*1024)throw new Error('Each file must be smaller than 1 GB.');await file.writeFile(chunk);}
      if(!size)throw new Error('The selected file is empty.');
      batch.files++;return {files:batch.files};
    }catch(error){if(file){await file.close();file=null;await rm(target,{force:true});}throw error;}
    finally{await file?.close();batch.busy=false;}
  }
  async finish(id){
    const batch=this.batches.get(id);
    if(!batch||batch.busy||!batch.files)throw new Error('Choose files before importing.');
    if(batch.root!==this.library.root()||this.library.job.running)throw new Error('The library changed. Cancel and try again.');
    const root=await realpath(batch.root),parent=path.join(root,'Folio Imports');
    await mkdir(parent,{recursive:true});
    if((await lstat(parent)).isSymbolicLink()||!inside(root,await realpath(parent)))throw new Error('The import folder must be inside your library.');
    const destination=path.join(parent,`Import ${new Date().toISOString().slice(0,10)} ${id}`);
    try{await rename(batch.directory,destination);}catch(error){
      if(error.code!=='EXDEV')throw error;
      try{await cp(batch.directory,destination,{recursive:true,errorOnExist:true,force:false});}
      catch(copyError){await rm(destination,{recursive:true,force:true});throw copyError;}
      await rm(batch.directory,{recursive:true,force:true});
    }
    this.batches.delete(id);
    await this.library.scan();return {files:batch.files,issues:this.library.job.issues};
  }
  async cancel(id){const batch=this.batches.get(id);if(!batch)return;if(batch.busy)throw new Error('Wait for the current file to finish.');await rm(batch.directory,{recursive:true,force:true});this.batches.delete(id);}
}
