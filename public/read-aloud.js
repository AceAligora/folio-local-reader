export function readingEstimate(text,wordsPerMinute=200){
  if(typeof text!=='string'||!Number.isInteger(wordsPerMinute)||wordsPerMinute<80||wordsPerMinute>600)throw new Error('Choose a reading pace between 80 and 600 words per minute.');
  const limited=text.length>500000,sample=text.slice(0,500000);let words=0;
  if(globalThis.Intl?.Segmenter){for(const part of new Intl.Segmenter(undefined,{granularity:'word'}).segment(sample))if(part.isWordLike)words++;}
  else words=(sample.match(/[\p{L}\p{N}]+/gu)||[]).length;
  return {words,seconds:Math.ceil(words/wordsPerMinute*60),wordsPerMinute,limited};
}

// One owner for speech, pending synthesis, temporary audio and the sleep timer.
export class ReadAloud{
  constructor({synth=globalThis.speechSynthesis,Utterance=globalThis.SpeechSynthesisUtterance,AudioType=globalThis.Audio,fetchImpl=(...args)=>globalThis.fetch(...args),createUrl=blob=>URL.createObjectURL(blob),revokeUrl=url=>URL.revokeObjectURL(url),now=Date.now,setTimer=(fn,ms)=>globalThis.setTimeout(fn,ms),clearTimer=id=>globalThis.clearTimeout(id),changed=()=>{}}={}){
    Object.assign(this,{synth,Utterance,AudioType,fetchImpl,createUrl,revokeUrl,now,setTimer,clearTimer,changed});this.version=0;this.state='idle';this.status='Choose an offline voice, then read the current page or chapter.';
  }
  snapshot(){return {state:this.state,status:this.status,page:this.page,sleepSeconds:this.deadline?Math.max(0,Math.ceil((this.deadline-this.now())/1000)):0};}
  notify(){this.changed(this.snapshot());}
  stop(message='Reading aloud stopped.'){
    this.version++;this.abort?.abort();this.abort=null;this.clearTimer(this.timer);this.timer=null;this.deadline=null;
    if(this.utterance){this.utterance.onend=this.utterance.onerror=null;this.synth?.cancel();this.utterance=null;}
    if(this.audio){this.audio.onended=this.audio.onerror=null;this.audio.pause();this.audio.src='';this.audio=null;}
    if(this.url){this.revokeUrl(this.url);this.url=null;}this.state='idle';this.status=message;this.notify();
  }
  checkSleep(){if(this.deadline&&this.now()>=this.deadline){this.stop('Sleep timer finished. Reading aloud stopped.');return true;}return false;}
  async start({getText,voice,rate=1,volume=1,sleepMinutes=0,page=0}){
    this.stop('');const version=this.version;this.state='preparing';this.status='Preparing text locally…';this.page=page;this.abort=new AbortController();this.notify();
    try{
      if(!Number.isFinite(rate)||rate<.5||rate>2||!Number.isFinite(volume)||volume<0||volume>1||!Number.isFinite(sleepMinutes)||sleepMinutes<0||sleepMinutes>120)throw new Error('Invalid speech controls.');
      if(!voice||voice.type!=='native'&&(voice.type!=='browser'||!voice.voice?.localService||!this.synth||!this.Utterance))throw new Error('Choose an installed offline voice.');
      const raw=await getText();if(version!==this.version)return;if(typeof raw!=='string'||!raw.trim())throw new Error('No text found. Recognize this page with OCR first.');
      const limit=voice.type==='native'?6000:50000,content=raw.slice(0,limit),suffix=raw.length>limit?' · first '+limit.toLocaleString()+' characters only':'';
      if(voice.type==='native'){
        this.status='Preparing local audio…';this.notify();const response=await this.fetchImpl('/api/speech',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:content,voice:voice.name}),signal:this.abort.signal});
        if(!response.ok)throw new Error((await response.json()).error||'Local speech preparation failed.');const blob=await response.blob();if(version!==this.version)return;
        this.url=this.createUrl(blob);const audio=this.audio=new this.AudioType(this.url);audio.playbackRate=rate;audio.volume=volume;audio.preservesPitch=true;audio.onended=()=>{if(version===this.version)this.stop('Finished reading the current section.');};audio.onerror=()=>{if(version===this.version)this.stop('Local audio could not be played.');};await audio.play();if(version!==this.version)return;
      }else{
        const utterance=this.utterance=new this.Utterance(content);utterance.voice=voice.voice;utterance.lang=voice.voice.lang;utterance.rate=rate;utterance.volume=volume;
        utterance.onend=()=>{if(version===this.version)this.stop('Finished reading the current section.');};utterance.onerror=()=>{if(version===this.version)this.stop('The offline voice could not read this section.');};this.synth.speak(utterance);if(version!==this.version)return;
      }
      this.state='playing';this.status='Reading aloud locally'+suffix+'.';if(sleepMinutes){this.deadline=this.now()+sleepMinutes*60000;this.timer=this.setTimer(()=>this.checkSleep(),sleepMinutes*60000);}this.notify();
    }catch(error){if(version===this.version){this.stop(error.message);throw error;}}
  }
  pause(){if(this.state!=='playing'||this.checkSleep())return;if(this.audio)this.audio.pause();else this.synth?.pause();this.state='paused';this.status='Reading aloud paused.';this.notify();}
  async resume(){if(this.state!=='paused'||this.checkSleep())return;const version=this.version;try{if(this.audio)await this.audio.play();else this.synth?.resume();if(version!==this.version)return;this.state='playing';this.status='Reading aloud locally.';this.notify();}catch(error){if(version===this.version)this.stop(error.message);}}
}
