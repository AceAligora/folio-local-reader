import {test} from 'node:test';import assert from 'node:assert/strict';
import {ReadAloud,readingEstimate} from '../public/read-aloud.js';import {validatePreferences} from '../lib/preferences.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
class Utterance{constructor(text){this.text=text;}}
function fixture(){const calls=[],synth={speak:u=>calls.push(['speak',u]),cancel:()=>calls.push(['cancel']),pause:()=>calls.push(['pause']),resume:()=>calls.push(['resume'])};const control=new ReadAloud({synth,Utterance});return {calls,synth,control};}
const voice={type:'browser',voice:{localService:true,lang:'en-US',name:'Local test voice'}};
test('reading-time estimates count local words, reject invalid pace and identify bounded text samples',()=>{
  assert.equal(readingEstimate('One two three',180).words,3);assert.equal(readingEstimate('One two three',180).seconds,1);assert.equal(readingEstimate('',200).words,0);assert.equal(readingEstimate('áccent 日本語 123',200).words>0,true);assert.equal(readingEstimate('x'.repeat(500001)).limited,true);assert.throws(()=>readingEstimate('text',0));
  for(const patch of [{speechRate:49},{speechVolume:101},{speechSleepMinutes:121},{readingWordsPerMinute:79}])assert.throws(()=>validatePreferences(patch));assert.equal(validatePreferences({speechRate:125,speechVolume:0}).speechRate,125);
});
test('browser speech uses only explicitly local voices with bounded text, speed and volume',async()=>{
  const {control,calls}=fixture();await control.start({voice,getText:async()=> 'x'.repeat(50001),rate:1.25,volume:.3});assert.equal(control.state,'playing');const utterance=calls.find(c=>c[0]==='speak')[1];assert.equal(utterance.text.length,50000);assert.equal(utterance.rate,1.25);assert.equal(utterance.volume,.3);assert.match(control.status,/50,000/);control.pause();assert.equal(control.state,'paused');await control.resume();assert.equal(control.state,'playing');control.stop();assert.equal(calls.filter(c=>c[0]==='cancel').length,1);await assert.rejects(control.start({voice:{type:'browser',voice:{localService:false}},getText:async()=>'text'}),/offline voice/);
});
test('sleep timer includes paused time and prevents resuming after its deadline',async()=>{
  const {synth}=fixture();let clock=1000,timer;const control=new ReadAloud({synth,Utterance,now:()=>clock,setTimer:fn=>(timer=fn,1),clearTimer:()=>{}});await control.start({voice,getText:async()=>'text',sleepMinutes:1});control.pause();clock+=30000;assert.equal(control.snapshot().sleepSeconds,30);clock+=30001;await control.resume();assert.equal(control.state,'idle');assert.match(control.status,/Sleep timer finished/);timer();assert.equal(control.state,'idle');
});
test('stop during text extraction or old session completion cannot restart speech',async()=>{
  const {control,calls}=fixture(),pending=deferred();const old=control.start({voice,getText:()=>pending.promise});control.stop();await control.start({voice,getText:async()=>'new reading'});pending.resolve('old reading');await old;assert.equal(calls.filter(c=>c[0]==='speak').length,1);assert.equal(calls.find(c=>c[0]==='speak')[1].text,'new reading');control.stop();
});
test('stopping native preparation aborts its request and ignores a late audio response',async()=>{
  const pending=deferred();let signal,created=0;const control=new ReadAloud({fetchImpl:async(url,options)=>{signal=options.signal;return pending.promise;},AudioType:class{constructor(){created++;}}});const run=control.start({voice:{type:'native',name:'Offline'},getText:async()=>'text'});await new Promise(r=>setImmediate(r));assert.equal(control.state,'preparing');control.stop();assert.equal(signal.aborted,true);pending.resolve(new Response(new Uint8Array([1,2])));await run;assert.equal(created,0);assert.equal(control.state,'idle');
});
test('native playback pause/resume and completion release the audio and its temporary URL',async()=>{
  let audio;const revoked=[];class Audio{constructor(url){this.src=url;audio=this;this.plays=0;this.pauses=0;}async play(){this.plays++;}pause(){this.pauses++;}}
  const control=new ReadAloud({AudioType:Audio,fetchImpl:async()=>new Response(new Uint8Array([1,2])),createUrl:()=> 'blob:generated',revokeUrl:url=>revoked.push(url)});await control.start({voice:{type:'native',name:'Offline'},getText:async()=>'local page',rate:1.5,volume:0});assert.equal(audio.playbackRate,1.5);assert.equal(audio.volume,0);control.pause();await control.resume();assert.equal(audio.plays,2);audio.onended();assert.equal(control.state,'idle');assert.deepEqual(revoked,['blob:generated']);assert.equal(audio.src,'');
});
