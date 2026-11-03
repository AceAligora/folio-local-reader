import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';

export const fileStamp = info => [info.dev,info.ino,info.size,info.mtimeNs,info.ctimeNs].join(':');
async function openBook(library,id) {
  const file=await library.content(id);
  const handle=await open(file,constants.O_RDONLY|constants.O_NONBLOCK|(constants.O_NOFOLLOW||0));
  try {const info=await handle.stat({bigint:true});if(!info.isFile())throw new Error('Not a regular file.');return {handle,info};}
  catch(error){await handle.close();throw error;}
}
export async function inspectBook(library,id) {
  const {handle,info}=await openBook(library,id);
  try{return {size:Number(info.size),stamp:fileStamp(info)};}finally{await handle.close();}
}
export async function hashBook(library,id,{maxBytes=2*1024**3,active=()=>true,onBytes=()=>{}}={}) {
  const {handle,info}=await openBook(library,id);
  try {
    if(info.size>BigInt(maxBytes))throw new Error('File exceeds the remaining verification read limit.');
    const hash=createHash('sha256'),buffer=Buffer.alloc(256*1024);let size=0;
    while(true){
      if(!active())throw new Error('Verification cancelled; no fingerprint saved.');
      const {bytesRead}=await handle.read(buffer,0,Math.min(buffer.length,maxBytes-size+1),size);
      if(!bytesRead)break;
      size+=bytesRead;onBytes(bytesRead);
      if(size>maxBytes)throw new Error('File exceeds the verification read limit.');
      hash.update(buffer.subarray(0,bytesRead));
    }
    const after=await handle.stat({bigint:true});
    const current=await inspectBook(library,id);
    if(!active())throw new Error('Verification cancelled; no fingerprint saved.');
    if(BigInt(size)!==info.size||fileStamp(after)!==fileStamp(info)||current.stamp!==fileStamp(info))throw new Error('File changed during verification; scan and try again.');
    return {size,stamp:current.stamp,sha256:hash.digest('hex')};
  }finally{await handle.close();}
}
