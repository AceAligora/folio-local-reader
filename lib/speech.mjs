import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
const execute=promisify(execFile);
export class LocalSpeech{
  constructor(profile){this.directory=path.resolve(profile,'speech-temp');this.controllers=new Set();}
  async run(request,{signal:parentSignal}={}){
    if(process.platform!=='win32')throw new Error('Windows offline voices are not available on this platform.');
    const controller=new AbortController(),signal=parentSignal?AbortSignal.any([parentSignal,controller.signal]):controller.signal;this.controllers.add(controller);let input,output;
    try{await mkdir(this.directory,{recursive:true});const id=crypto.randomUUID();input=path.join(this.directory,id+'.json');output=path.join(this.directory,id+'.wav');
    await writeFile(input,JSON.stringify({...request,output}),{flag:'wx'});
    const literal="[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('"+Buffer.from(input).toString('base64')+"'))";
    const command=`$ErrorActionPreference='Stop';[Console]::OutputEncoding=[Text.Encoding]::UTF8;Add-Type -AssemblyName System.Speech;$request=Get-Content -Raw -LiteralPath (${literal}) -Encoding UTF8 | ConvertFrom-Json;$synth=New-Object System.Speech.Synthesis.SpeechSynthesizer;try{$voices=@($synth.GetInstalledVoices() | Where-Object {$_.Enabled} | ForEach-Object {@{name=$_.VoiceInfo.Name;language=$_.VoiceInfo.Culture.Name}});if($request.mode -eq 'voices'){ConvertTo-Json -Compress -InputObject $voices}else{if($request.voice -notin $voices.name){throw 'Choose an installed voice.'};$synth.SelectVoice($request.voice);$synth.SetOutputToWaveFile($request.output);$synth.Speak($request.text)}}finally{$synth.Dispose()}`;
    const {stdout}=await execute('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{signal,windowsHide:true,timeout:45000,maxBuffer:1024*1024,encoding:'utf8'});return request.mode==='voices'?JSON.parse(stdout):await readFile(output);}catch{throw new Error(signal?.aborted?'Speech preparation cancelled.':'The installed Windows voice could not synthesize this text.');}finally{try{if(input)await rm(input,{force:true});if(output)await rm(output,{force:true});}finally{this.controllers.delete(controller);}}
  }
  cancel(){for(const controller of this.controllers)controller.abort();}
  async voices(){if(process.platform!=='win32')return [];return this.run({mode:'voices'});}
  async speak(text,voice,options={}){if(this.busy)throw new Error('A page is already being prepared for speech.');if(typeof text!=='string'||!text.trim()||text.length>6000||typeof voice!=='string'||voice.length>200)throw new Error('Choose a local voice and up to 6,000 characters.');this.busy=true;try{return await this.run({mode:'speak',text,voice},options);}finally{this.busy=false;}}
}
