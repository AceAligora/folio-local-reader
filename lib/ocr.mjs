import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const execute=promisify(execFile),script=fileURLToPath(new URL('../scripts/windows-ocr.ps1',import.meta.url));
export class OcrService{
  constructor(library,profile){this.library=library;this.directory=path.resolve(profile,'ocr-temp');}
  async run(args){if(process.platform!=='win32')throw new Error('The bundled OCR adapter currently requires Windows OCR.');try{const source=(await readFile(script,'utf8')).split('\n').slice(1).join('\n'),value=key=>{const index=args.indexOf(key);return index<0?'':args[index+1];},literal=text=>"[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('"+Buffer.from(text).toString('base64')+"'))",command="[Console]::OutputEncoding=[Text.Encoding]::UTF8;$ImagePath="+literal(value('-ImagePath'))+";$Language="+literal(value('-Language'))+";$Languages="+(args.includes('-Languages')?'$true':'$false')+";\n"+source;const {stdout}=await execute('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{windowsHide:true,timeout:45000,maxBuffer:2*1024*1024,encoding:'utf8'});return JSON.parse(stdout.replace(/^\uFEFF/,''));}catch{throw new Error('Windows OCR is unavailable. Check installed OCR languages in Windows Settings.');}}
  async languages(){if(process.platform!=='win32')return {available:false,languages:[]};try{const languages=await this.run(['-Languages']);return {available:languages.length>0,languages};}catch{return {available:false,languages:[]};}}
  async recognize(id,page,language,stream){if(!this.library.book(id)||!Number.isInteger(page)||page<0||page>1e6)throw new Error('Invalid OCR book or page.');if(this.busy)throw new Error('OCR is already processing a page.');if(language&&!/^[a-zA-Z-]{2,30}$/.test(language))throw new Error('Invalid OCR language.');this.busy=true;let file;
    try{let size=0;const chunks=[];for await(const chunk of stream){size+=chunk.length;if(size>8*1024*1024)throw new Error('OCR images must be smaller than 8 MB.');chunks.push(chunk);}const png=Buffer.concat(chunks);if(png.length<24||!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||png.readUInt32BE(16)>3000||png.readUInt32BE(20)>3000)throw new Error('Use a PNG page up to 3000 pixels per side.');await mkdir(this.directory,{recursive:true});file=path.join(this.directory,crypto.randomUUID()+'.png');await writeFile(file,png,{flag:'wx'});return await this.run(['-ImagePath',file,...(language?['-Language',language]:[])]);}finally{if(file)await rm(file,{force:true});this.busy=false;}
  }
}
