import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spreadPages,adjacentSpread} from '../public/spreads.js';
test('double-page navigation covers every page with separate covers and odd endings',()=>{
  for(const total of [1,2,3,6,7,100])for(const separate of [true,false]){
    const visited=[];let index=0;
    for(let steps=0;steps<=total;steps++){
      const spread=spreadPages(index,total,'double',separate,true);visited.push(...spread);
      if(spread.at(-1)===total-1)break;
      index=adjacentSpread(index,total,1,'double',separate,true);
    }
    assert.deepEqual(visited,Array.from({length:total},(_,i)=>i));
  }
  assert.deepEqual(spreadPages(2,8,'auto',true,false),[2]);
  assert.deepEqual(spreadPages(2,8,'auto',true,true),[1,2]);
  assert.equal(adjacentSpread(3,8,-1,'double',true,true),2);
  assert.deepEqual(spreadPages(0,0),[]);
});
function luminance(hex){const values=hex.match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return values[0]*.2126+values[1]*.7152+values[2]*.0722;}
function contrast(a,b){const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (values[0]+.05)/(values[1]+.05);}
test('semantic theme colors meet minimum text contrast for main reading controls',()=>{
  const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
  for(const block of css.matchAll(/(?:^|\n)(:root(?:\[data-theme=(?:dark|sepia)\])?)\{([^}]+)\}/g)){
    const values=Object.fromEntries([...block[2].matchAll(/--([\w-]+):(#(?:[a-f0-9]{6}|[a-f0-9]{3}))(?=;|\})/g)].map(([,key,value])=>[key,value.length===4?'#'+value.slice(1).split('').map(c=>c+c).join(''):value]));
    for(const surface of ['bg','surface','surface-2','sidebar'])for(const color of ['text','muted'])assert.ok(contrast(values[color],values[surface])>=4.5,`${block[1]} ${color} on ${surface}`);
    if(values['accent-text'])assert.ok(contrast(values['accent-text'],values.accent)>=4.5);
  }
});
