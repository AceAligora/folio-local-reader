import {mkdir,readFile,writeFile,stat,cp,rename} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Readable,Transform} from 'node:stream';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeBuildManifest} from '../lib/distribution.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),pkg=JSON.parse(await readFile(path.join(root,'package.json'))),runtime=JSON.parse(await readFile(path.join(root,'desktop/runtime.json')));
const label=process.argv[2]||'';if(label&&!/^[a-z0-9-]{1,30}$/.test(label))throw new Error('Build labels use lowercase letters, digits and hyphens.');
if(process.platform!==runtime.platform||process.arch!==runtime.arch)throw new Error('The desktop preview currently builds on Windows x64 only.');
const target=path.join(root,'.local/dist',`Folio-${pkg.version}-desktop-win32-x64${label?'-'+label:''}`),stage=path.join(root,'.local/dist','.desktop-build-'+randomUUID()),cache=path.join(root,'.local/vendor'),archive=path.join(cache,`electron-${runtime.version}-win32-x64.zip`);
try{await stat(target);throw new Error('This desktop release already exists. Builds never overwrite releases.');}catch(error){if(error.code!=='ENOENT')throw error;}
const checksum=async file=>{const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');};
await mkdir(cache,{recursive:true});let cached=false;try{cached=(await stat(archive)).isFile();}catch(error){if(error.code!=='ENOENT')throw error;}
if(!cached){
  console.log('Downloading pinned Electron '+runtime.version+' from its official release.');
  const response=await fetch(runtime.url,{signal:AbortSignal.timeout(180000)});if(!response.ok)throw new Error('Electron download HTTP '+response.status);
  const temporary=archive+'.'+randomUUID()+'.part';let size=0;const hash=createHash('sha256');
  await pipeline(Readable.fromWeb(response.body),new Transform({transform(chunk,encoding,done){size+=chunk.length;if(size>250*1024*1024)return done(new Error('Electron archive exceeds the build limit.'));hash.update(chunk);done(null,chunk);}}),createWriteStream(temporary,{flags:'wx'}));
  if(hash.digest('hex')!==runtime.sha256)throw new Error('Electron checksum mismatch. The partial file was retained for inspection; nothing will execute.');await rename(temporary,archive);
}
if(await checksum(archive)!==runtime.sha256)throw new Error('The cached Electron archive failed its pinned checksum.');
console.log('Electron checksum verified.');
const baseLabel='desktop-base-'+randomUUID().slice(0,8),build=spawnSync(process.execPath,[path.join(root,'scripts/build-portable.mjs'),baseLabel],{cwd:root,env:process.env,encoding:'utf8'});if(build.status!==0)throw new Error(build.stderr||build.stdout||'Portable base build failed.');
const base=path.join(root,'.local/dist',`Folio-${pkg.version}-win32-x64-${baseLabel}`);
await mkdir(stage,{recursive:true});const quote=value=>"'"+value.replaceAll("'","''")+"'";
const extract=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`[void][System.Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem'); [System.IO.Compression.ZipFile]::ExtractToDirectory(${quote(archive)},${quote(stage)})`],{encoding:'utf8',windowsHide:true});if(extract.status!==0)throw new Error(extract.stderr||'Electron extraction failed.');
await rename(path.join(stage,'electron.exe'),path.join(stage,'Folio.exe'));
await mkdir(path.join(stage,'resources/app'),{recursive:true});await cp(path.join(root,'desktop'),path.join(stage,'resources/app/desktop'),{recursive:true,errorOnExist:true,force:false});
await writeFile(path.join(stage,'resources/app/package.json'),JSON.stringify({name:'folio-desktop',version:pkg.version,main:'desktop/main.cjs',license:'Apache-2.0',private:true},null,2));
await mkdir(path.join(stage,'resources/folio'));for(const entry of ['app','runtime'])await cp(path.join(base,entry),path.join(stage,'resources/folio',entry),{recursive:true,errorOnExist:true,force:false});
await writeFile(path.join(stage,'READ-ME.txt'),`Folio ${pkg.version} Desktop preview\n\nDouble-click Folio.exe. This unsigned Windows x64 preview needs no Node/npm installation. It uses the same local Folio profile as the browser edition and reuses a verified running server. If it starts its own server, closing Folio stops that server after saving reading progress.\n\nNative settings: Settings > Security > exclude from screen capture; Settings > Reader > keep screen on; Settings > Appearance > taskbar reading progress. Screen-capture exclusion is a Windows feature, not encryption or a guarantee against all capture methods.\n\nUse Folio > Open ebook (Ctrl+O) to open local PDF/EPUB/CBZ files. The portable folder does not register itself. A separate unsigned setup executable can install per user and optionally add Open with entries without changing defaults. Uninstall preserves books and profiles. Settings > Chapter feeds follows RSS/Atom series and saves selected chapters as local EPUBs. Settings > Source sessions offers isolated temporary source windows for manual sign-in/challenges. Cookies are memory-only and explicitly adopted through the native source menu; no automatic challenge bypass is promised. No updater or downloaded adapter code execution is included. No books or personal profiles are bundled.\n\nElectron ${runtime.version}: MIT license and Chromium notices are beside this file. Folio license/notices are in resources/folio/app; Node license is in resources/folio/runtime.\n`);
await writeBuildManifest(stage,{version:pkg.version,kind:'desktop-portable',electron:runtime.version});await rename(stage,target);
console.log(target);
