import {unpackEpub} from './epub-reader.js';
export function archivePages(files){return Object.keys(files).filter(name=>/\.(png|jpe?g|webp|gif)$/i.test(name)&&!name.startsWith('__MACOSX/')).sort((a,b)=>a.localeCompare(b,'en',{numeric:true,sensitivity:'base'})||(a<b?-1:a>b?1:0));}
export class ArchiveReader{
  close(){for(const url of this.urls?.values()||[])URL.revokeObjectURL(url);this.urls=new Map();this.files=null;this.names=[];this.version=(this.version||0)+1;}
  async open(id){this.close();const version=this.version,response=await fetch('/content/'+id+'/0');if(!response.ok)throw new Error('Comic archive could not be opened.');if(Number(response.headers.get('Content-Length'))>80*1024*1024)throw new Error('CBZ archives are limited to 80 MB.');const bytes=new Uint8Array(await response.arrayBuffer());if(version!==this.version)throw new Error('Opening cancelled.');this.files=unpackEpub(bytes);this.names=archivePages(this.files);if(!this.names.length)throw new Error('The CBZ contains no supported images.');return this.names.length;}
  blob(index){const name=this.names[index],file=this.files?.[name];if(!file)throw new Error('Comic page unavailable.');const ext=name.split('.').pop().toLowerCase();return new Blob([file],{type:{jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp'}[ext]});}
  url(index){if(!this.urls.has(index))this.urls.set(index,URL.createObjectURL(this.blob(index)));return this.urls.get(index);}
}
