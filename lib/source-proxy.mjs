import http from 'node:http';
import net from 'node:net';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {resolvePublic,sourceURL} from './source-policy.mjs';

// Chromium connects through this narrow proxy so DNS validation and the TCP destination
// are the same lookup, including for a malicious source that attempts DNS rebinding.
export async function sourceProxy(origin,{resolve=resolvePublic,connect=options=>net.connect(options)}={}){
  const host=sourceURL(origin).hostname,allowed=new Set([host,'challenges.cloudflare.com']),username=randomBytes(16).toString('hex'),password=randomBytes(32).toString('hex'),authorization=Buffer.from('Basic '+Buffer.from(username+':'+password).toString('base64')),sockets=new Set();let closed=false;
  const server=http.createServer((_req,res)=>{res.writeHead(403);res.end();});server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});});
  server.on('connect',async(req,client,head)=>{
    const supplied=Buffer.from(req.headers['proxy-authorization']||'');if(supplied.length!==authorization.length||!timingSafeEqual(supplied,authorization)){client.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Folio source session"\r\nContent-Length: 0\r\n\r\n');return;}
    const match=/^([a-z0-9.-]+):443$/i.exec(req.url);if(closed||sockets.size>32||!match||!allowed.has(match[1].toLowerCase())){client.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
    try{const target=await resolve(match[1].toLowerCase());if(closed||client.destroyed)return;const remote=connect({host:target.address,family:target.family,port:443});sockets.add(remote);remote.setTimeout(60000,()=>remote.destroy());remote.on('close',()=>sockets.delete(remote));remote.on('error',()=>client.destroy());client.on('close',()=>remote.destroy());remote.on('connect',()=>{client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)remote.write(head);remote.pipe(client);client.pipe(remote);});}catch{client.end('HTTP/1.1 403 Forbidden\r\n\r\n');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});server.unref();return {address:'127.0.0.1:'+server.address().port,username,password,close:async()=>{closed=true;for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}};
}
