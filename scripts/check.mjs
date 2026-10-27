import {fileURLToPath} from 'node:url';
import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
for(const directory of ['lib','public','scripts','test','desktop'])for(const name of await readdir(new URL('../'+directory+'/',import.meta.url))){if(!/\.([cm]?js)$/.test(name))continue;const result=spawnSync(process.execPath,['--check',fileURLToPath(new URL('../'+directory+'/'+name,import.meta.url))],{encoding:'utf8'});if(result.status){process.stderr.write(result.stderr);process.exit(result.status);}}
const result=spawnSync(process.execPath,['--check',fileURLToPath(new URL('../server.mjs',import.meta.url))],{encoding:'utf8'});if(result.status){process.stderr.write(result.stderr);process.exit(result.status);}console.log('All application, service, script and test modules passed syntax checks.');
