const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const media=require('./media.cjs');
const {ensureWhisper}=require('./whisper.cjs');
const {DATA_DIR,BIN_DIR,MODEL_DIR}=require('./runtime-paths.cjs');
const FFMPEG=path.join(BIN_DIR,'ffmpeg.exe');
function sampleOffsets(duration){return [...new Set([5,45,120,duration*.33,duration*.67].map(x=>Math.max(0,Math.floor(Math.min(x,duration-26)))))];}
function parseDetection(text){const m=text.match(/auto-detected language:\s*(\w+)\s*\(p\s*=\s*([\d.]+)/i);return m?{language:m[1],confidence:Number(m[2])}:null;}
function chooseLanguage(samples){
 const reliable=samples.filter(s=>s.language&&s.confidence>=.65&&(!Number.isFinite(s.peakDb)||s.peakDb>-60));
 if(!reliable.length)throw Error('Não foi possível detectar o idioma com segurança. Escolha o idioma do áudio no painel.');
 const scores=new Map();for(const s of reliable){const v=scores.get(s.language)||{language:s.language,count:0,confidence:0};v.count++;v.confidence+=s.confidence;scores.set(s.language,v);}
 const ranked=[...scores.values()].sort((a,b)=>b.count-a.count||b.confidence-a.confidence),top=ranked[0];
 return {language:top.language,confidence:top.confidence/top.count,reliableSamples:reliable.length,mixed:top.count/reliable.length<.65,candidates:ranked};
}
function sourceKey(item,language){const stat=fs.statSync(item.output);return crypto.createHash('sha256').update(JSON.stringify([2,fs.existsSync(path.join(MODEL_DIR,'ggml-small.bin'))?'small-zh':'base',path.resolve(item.output),stat.size,stat.mtimeMs,language])).digest('hex').slice(0,24);}
async function whisper(engine,args,{signal,onLine}={}){
 try{return await media.execute(engine.exe,[...args,...(engine.gpu?[]:['-ng'])],{signal,onLine});}
 catch(e){if(!engine.gpu||signal?.aborted)throw e;engine.gpu=false;engine.exe=engine.fallbackExe;return media.execute(engine.exe,[...args,'-ng'],{signal,onLine});}
}
async function detectSpeechLanguage(item,{signal,update=()=>{},engine,work}={}){
 engine||=await ensureWhisper(update,signal);
 const info=await media.probe(item.output,signal),key=sourceKey(item,'auto');
 work||=path.join(DATA_DIR,'work','speech-'+key);fs.mkdirSync(work,{recursive:true});
 const cache=path.join(work,'language.json');
 try{const saved=JSON.parse(fs.readFileSync(cache,'utf8'));if(saved.version===2&&saved.key===key&&saved.language)return saved;}catch{}
 const samples=[];
 for(const offset of sampleOffsets(info.duration)){
  signal?.throwIfAborted();update({phase:'Conferindo idioma do áudio · amostra '+(samples.length+1)+' de '+sampleOffsets(info.duration).length,progress:0});
  const wav=path.join(work,'detect-'+offset+'.wav');
  const audio=await media.execute(FFMPEG,['-hide_banner','-ss',String(offset),'-i',item.output,'-t','25','-ar','16000','-ac','1','-af','volumedetect','-y',wav],{signal});
  try{const result=await whisper(engine,['-m',engine.model,'-f',wav,'-l','auto','-dl','-t','6'],{signal});const detected=parseDetection(result.stdout+'\n'+result.stderr);const peak=Number(audio.stderr.match(/max_volume:\s*([\d.-]+) dB/)?.[1]);samples.push({offset,...detected,peakDb:Number.isFinite(peak)?peak:null});}
  finally{try{fs.unlinkSync(wav);}catch{}}
 }
 const result={version:2,key,...chooseLanguage(samples),samples,checkedAt:new Date().toISOString()};fs.writeFileSync(cache,JSON.stringify(result,null,2));return result;
}
function seconds(value){const m=value.match(/^(\d+):(\d+):(\d+),(\d{3})$/);if(!m)throw Error('Tempo de legenda inválido.');return Number(m[1])*3600+Number(m[2])*60+Number(m[3])+Number(m[4])/1000;}
function timestamp(value){const ms=Math.max(0,Math.round(value*1000));return String(Math.floor(ms/3600000)).padStart(2,'0')+':'+String(Math.floor(ms/60000)%60).padStart(2,'0')+':'+String(Math.floor(ms/1000)%60).padStart(2,'0')+','+String(ms%1000).padStart(3,'0');}
function parseChunk(text,offset,duration){
 if(!text.trim())return [];
 return text.replace(/^\uFEFF/,'').trim().split(/\r?\n\s*\r?\n/).map(block=>{const lines=block.split(/\r?\n/),at=lines.findIndex(l=>l.includes(' --> '));if(at<0)throw Error('Bloco de legenda inválido.');const [a,b]=lines[at].split(' --> '),start=seconds(a),end=seconds(b),content=lines.slice(at+1).join(' ').trim();if(!content||end<start||start>duration+1)throw Error('Tempos inválidos na transcrição.');return {start:offset+start,end:offset+Math.min(end,duration),text:content};}).filter(c=>c.end>c.start);
}
function transcriptQuality(cues){let run=0,maxRun=0,previous='';for(const c of cues){const v=c.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');run=v.length>12&&v===previous?run+1:1;previous=v;maxRun=Math.max(maxRun,run);}const repetitiveCues=cues.map((c,i)=>/([\p{L}])\1{11,}/u.test(c.text)?i+1:null).filter(Boolean);return {maxRepeatedRun:maxRun,repetitiveCues,suspicious:maxRun>=12||repetitiveCues.length>0};}
async function transcribe(item,language,{signal,update=()=>{}}={}){
 await media.inspect(item.output,{signal,volume:false});const engine=await ensureWhisper(update,signal),info=await media.probe(item.output,signal);
 const work=path.join(DATA_DIR,'work','speech-'+sourceKey(item,language));fs.mkdirSync(work,{recursive:true});
 const detection=language==='auto'?await detectSpeechLanguage(item,{signal,update,engine,work}):{version:2,language,manual:true,samples:[]};
 if(detection.mixed)throw Error('Foram detectados vários idiomas no áudio. Escolha o idioma principal antes de refazer a legenda.');
 const selected=detection.language,chunkSeconds=600,total=Math.ceil(info.duration/chunkSeconds),cues=[];
 const small=selected==='zh'?await require('./whisper.cjs').ensureSmallModel(update,signal):path.join(MODEL_DIR,'ggml-small.bin');
 if(selected==='zh'&&fs.existsSync(small)){engine.model=small;engine.modelName='Whisper small';}
 const modelName=engine.modelName||'Whisper base';
 const spokenName=({zh:'mandarim',en:'inglês',pt:'português',es:'espanhol',fr:'francês',ja:'japonês',de:'alemão',it:'italiano',ko:'coreano'})[selected]||selected;
 for(let i=0;i<total;i++){
  signal?.throwIfAborted();const offset=i*chunkSeconds,duration=Math.min(chunkSeconds,info.duration-offset),cache=path.join(work,'chunk-'+i+'.json');let chunk;
  try{const saved=JSON.parse(fs.readFileSync(cache,'utf8'));if(saved.language===selected&&saved.offset===offset&&saved.duration===duration&&Array.isArray(saved.cues)&&!transcriptQuality(saved.cues).suspicious)chunk=saved.cues;}catch{}
  if(!chunk){
   const wav=path.join(work,'chunk-'+i+'.wav'),prefix=path.join(work,'chunk-'+i);
   update({phase:'Transcrevendo '+spokenName+' · bloco '+(i+1)+' de '+total,progress:i/total*97});
   await media.execute(FFMPEG,['-v','error','-ss',String(offset),'-i',item.output,'-t',String(duration),'-map','0:a:0','-ar','16000','-ac','1','-y',wav],{signal});
   for(let attempt=0;attempt<2;attempt++){
    const args=['-m',engine.model,'-f',wav,'-l',selected,'-t',String(Math.max(2,Math.min(8,os.availableParallelism()-2))),'-mc','0','-tp',String(attempt*.2),'-osrt','-of',prefix,'-pp','-ml',attempt?'18':'60',...(attempt?[]:['-sow'])];
    await whisper(engine,args,{signal,onLine:line=>{const m=line.match(/progress\s*=\s*(\d+)%/);if(m)update({phase:'Transcrevendo '+spokenName+' · bloco '+(i+1)+' de '+total,progress:(i+Number(m[1])/100)/total*97});}});
    chunk=parseChunk(fs.readFileSync(prefix+'.srt','utf8'),offset,duration);if(!transcriptQuality(chunk).suspicious)break;
    if(attempt===1)throw Error('Transcrição repetitiva no bloco '+(i+1)+'. Os blocos anteriores foram salvos para retomada.');
   }
   fs.writeFileSync(cache,JSON.stringify({version:2,language:selected,offset,duration,cues:chunk}));
   for(const file of [wav,prefix+'.srt'])try{fs.unlinkSync(file);}catch{}
  }
  cues.push(...chunk);update({phase:'Transcrição '+spokenName+' · '+(i+1)+' de '+total+' blocos salvos',progress:(i+1)/total*97});
 }
 if(!cues.length)throw Error('O Whisper não encontrou fala suficiente para gerar legendas.');
 const originalDir=path.join(path.dirname(item.output),'Legendas originais');fs.mkdirSync(originalDir,{recursive:true});
 const outputBase=path.join(originalDir,path.basename(item.output).replace(/\.mp4$/i,'')+'.whisper-'+Date.now()),outputs={};
 const srt=cues.map((c,i)=>(i+1)+'\n'+timestamp(c.start)+' --> '+timestamp(c.end)+'\n'+c.text).join('\n\n')+'\n';
 const vtt='WEBVTT\n\n'+cues.map(c=>timestamp(c.start).replace(',','.')+' --> '+timestamp(c.end).replace(',','.')+'\n'+c.text.replaceAll('&','&amp;').replaceAll('<','&lt;')).join('\n\n')+'\n';
 for(const [ext,text]of Object.entries({srt,vtt,txt:cues.map(c=>c.text).join('\n')})){outputs[ext]=outputBase+'.'+ext;fs.writeFileSync(outputs[ext],text,{flag:'wx'});}
 return {...outputs,language:selected,languageDetection:detection,detectionVersion:2,model:modelName,createdAt:new Date().toISOString()};
}
module.exports={sampleOffsets,parseDetection,chooseLanguage,seconds,timestamp,parseChunk,transcriptQuality,detectSpeechLanguage,transcribe};
