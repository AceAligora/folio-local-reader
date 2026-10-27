import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Library} from '../lib/library.mjs';
import {NetworkServices,repositoryJson,normalizeCatalogue} from '../lib/network.mjs';
const repository='https://github.com/example/extensions/raw/repo/index.pb';
test('repository addresses and manifests do not permit arbitrary network proxies',()=>{
  assert.equal(repositoryJson(repository),'https://raw.githubusercontent.com/example/extensions/repo/index.json');
  assert.throws(()=>repositoryJson('https://127.0.0.1/index.pb'));
  assert.throws(()=>repositoryJson('https://github.com:444/a/b/raw/repo/index.pb'));
  const catalogue=normalizeCatalogue({name:'Test',extensionList:{extensions:[{name:'Reader',packageName:'org.example.reader',versionName:'1',sources:[{language:'en'}]}]}});
  assert.equal(catalogue.extensions[0].language,'en');
  assert.throws(()=>normalizeCatalogue({items:[]}));
});
test('network is opt-in, cached locally, and never modifies ebook originals',async()=>{
  const profile=await mkdtemp(path.join(os.tmpdir(),'folio-net-'));const root=path.join(profile,'books');await mkdir(root);await writeFile(path.join(root,'Example.pdf'),'original book');const lib=new Library(path.join(profile,'profile.sqlite'));
  let calls=0;const fakeFetch=async address=>{calls++;if(address.hostname==='openlibrary.org')return new Response(JSON.stringify({docs:[{key:'/works/OL1W',title:'Example title',author_name:['Example author'],first_publish_year:2000}]}));if(address.pathname.endsWith('.apk'))return new Response(new Uint8Array([0x50,0x4b,3,4,1,2,3]));return new Response(JSON.stringify({name:'Fixture catalogue',extensionList:{extensions:[{name:'Example',packageName:'org.example.fixture',versionName:'1.0',resources:{apkUrl:'https://github.com/example/extensions/releases/download/v1/example.apk'}}]}}));};
  const net=new NetworkServices(lib,profile,{fetchImpl:fakeFetch});
  try{
    await lib.configure(root);await lib.scan();lib.preferences({repositories:[repository]});
    await assert.rejects(net.refresh(repository),/Enable optional network/);assert.equal(calls,0);
    lib.preferences({networkEnabled:true});const catalogue=await net.refresh(repository);assert.equal(catalogue.extensions.length,1);
    const metadata=await net.metadata('Example title');net.applyMetadata(lib.list().books[0].id,metadata.query,metadata.results[0].key);assert.equal(lib.list('Example author').total,1);
    const downloaded=await net.download(repository,'org.example.fixture');assert.equal(net.packages().length,1);assert.equal((await readFile((await net.packageFile(downloaded.id)).file)).length,7);
    lib.preferences({networkEnabled:false});const previous=calls;assert.equal(net.catalogue(repository).extensions[0].name,'Example');assert.equal(calls,previous);await assert.rejects(net.download(repository,'org.example.fixture'),/Enable optional network/);
    await net.remove(downloaded.id);assert.equal(net.packages().length,0);assert.equal(await readFile(path.join(root,'Example.pdf'),'utf8'),'original book');
    lib.preferences({networkEnabled:true});await assert.rejects(net.bounded('https://127.0.0.1/private',100,['raw.githubusercontent.com']),/approved service/);assert.equal(calls,previous);
  }finally{lib.close();await rm(profile,{recursive:true,force:true});}
});
