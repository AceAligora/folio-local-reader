import {cp,mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeBuildManifest} from '../lib/distribution.mjs';
const suffix=process.argv[2]||'';if(suffix&&!/^[a-z0-9-]{1,30}$/.test(suffix))throw new Error('Build labels use lowercase letters, digits and hyphens.');
const root=fileURLToPath(new URL('../',import.meta.url)),pkg=JSON.parse(await readFile(path.join(root,'package.json'))),target=path.join(root,'.local','dist',`Folio-${pkg.version}-${process.platform}-${process.arch}${suffix?"-"+suffix:""}`);
try{await stat(target);throw new Error('This release folder already exists. Keep it or choose a new version; builds never overwrite releases.');}catch(error){if(error.code!=='ENOENT')throw error;}
// Distribution is an explicit allowlist; profiles, books, source mirrors and QA images cannot enter it.
const entries=['public','lib','docs','scripts/windows-ocr.ps1','scripts/restore-profile.mjs','server.mjs','package.json','README.md','LICENSE','NOTICE','SECURITY.md','CONTRIBUTING.md'];
let license;const local=process.env.NODE_LICENSE_FILE;
if(local)license=await readFile(local,'utf8');else{const response=await fetch(`https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('Could not retrieve the matching Node license. Set NODE_LICENSE_FILE to an existing official license file.');license=await response.text();}
if(license.length<1000||!license.includes('Node.js'))throw new Error('Use the complete license from this Node runtime distribution.');
await mkdir(path.join(target,'app'),{recursive:true});await mkdir(path.join(target,'runtime'));
for(const entry of entries)await cp(path.join(root,entry),path.join(target,'app',entry),{recursive:true,errorOnExist:true,force:false});
await cp(process.execPath,path.join(target,'runtime',process.platform==='win32'?'node.exe':'node'));await writeFile(path.join(target,'runtime','LICENSE'),license);
if(process.platform==='win32')await writeFile(path.join(target,'Start Folio.cmd'),'@echo off\r\ncd /d "%~dp0"\r\n"%~dp0runtime\\node.exe" "%~dp0app\\server.mjs" --open\r\npause\r\n');
else await writeFile(path.join(target,'start-folio.sh'),'#!/bin/sh\ncd "$(dirname "$0")"\n./runtime/node ./app/server.mjs --open\n',{mode:0o755});
await writeFile(path.join(target,'READ-ME.txt'),'Folio '+pkg.version+' portable preview\n\nStart Folio using the launcher. No Node installation or npm is required. Keep the launcher open while reading. Your personal data stays in your OS user profile; no ebook files are included in this distribution.\n\nThis is a portable browser-based application, not a signed native installer. OCR and Windows speech use installed Windows components.\n');
await writeBuildManifest(target,{version:pkg.version,kind:'browser-portable'});console.log(target);
