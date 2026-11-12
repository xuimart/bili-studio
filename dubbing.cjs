const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const {DATA_DIR,BIN_DIR}=require('./runtime-paths.cjs'),{runWorker,ENGINE,MODEL}=require('./dubbing-runtime.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const machine=hash([os.hostname(),os.cpus()[0]?.model,os.arch()].join('|'));
function voice(value='male'){if(!['male','female'].includes(value))throw Error('Escolha uma voz válida.');return value;}
function compatibleBenchmark(benchmark,v=benchmark?.voice){return benchmark?.engine===ENGINE&&benchmark?.model===MODEL&&benchmark?.machine===machine&&benchmark?.voice===v&&Number.isFinite(benchmark.rtf)&&benchmark.rtf>0&&benchmark.rtf<1000?benchmark:null;}
function estimate(duration,benchmark,v){const b=compatibleBenchmark(benchmark,v);if(!b||!Number.isFinite(duration)||duration<=0)return null;const synthesis=duration*b.rtf;return{lowerSeconds:Math.ceil(synthesis*.8+b.loadSeconds+10),upperSeconds:Math.ceil(synthesis*1.75+b.loadSeconds+Math.max(15,duration*.02)),synthesisSeconds:synthesis,measuredAt:b.measuredAt,sampleSeconds:b.sampleSeconds,excludes:['download','transcrição','tradução','preparação inicial']};}
function phraseParts(text,span){
 const words=text.trim().split(/\s+/),parts=[],weight=word=>Math.max(1,word.replace(/[^\p{L}\p{N}]/gu,'').length),weights=words.map(weight),total=weights.reduce((a,b)=>a+b,0);
 if(span<=18&&words.length<=48)return[{text:words.join(' '),weight:total}];
 const weak=/^(a|o|as|os|um|uma|uns|umas|de|do|da|dos|das|em|no|na|nos|nas|por|pelo|pela|para|pra|com|sem|e|ou|que|se|ao|aos|à|às|sobre|entre|através|meio)$/iu;
 let start=0;
 while(start<words.length){let sum=0,end=words.length,best=0;for(let i=start;i<words.length;i++){
  sum+=weights[i];const seconds=span*sum/total,n=i-start+1,punctuation=/[.!?;:]["'”’)]*$/.test(words[i]),clause=/[,]["'”’)]*$/.test(words[i]);
  if(punctuation&&(seconds>=3||n>=6)){end=i+1;break;}
  if((clause||/^(mas|porque|enquanto|embora|portanto|porém)$/iu.test(words[i+1]||''))&&seconds>=5)best=i+1;
  if(seconds>=18||n>=48){if(best>start)end=best;else if(!weak.test(words[i].replace(/[^\p{L}]/gu,''))&&!weak.test((words[i+1]||'').replace(/[^\p{L}]/gu,'')))end=i+1;else continue;break;}
 }
 parts.push({text:words.slice(start,end).join(' '),weight:weights.slice(start,end).reduce((a,b)=>a+b,0)});start=end;}
 return parts;
}
function makeSegments(cues,duration,pauses=[]){
 const normalized=require('./topic-summary.cjs').summaryCues(cues,duration).cues,groups=[];
 const rate=cue=>cue.text.trim().split(/\s+/).length/Math.max(.01,cue.end-cue.start);
 for(const original of normalized){if(!/[\p{L}\p{N}]/u.test(original.text)||/^\[(?:música|silêncio|music|aplausos)\]$/i.test(original.text.trim()))continue;const cue={...original};for(const pause of pauses){if(cue.start>=pause.start&&cue.start<pause.end)cue.start=Math.min(pause.end,cue.end);if(cue.end>pause.start&&cue.end<=pause.end)cue.end=Math.max(cue.start,pause.start);}if(cue.end-cue.start<.1){cue.start=original.start;cue.end=original.end;}const previous=groups.at(-1);if(previous&&cue.start-previous.end<.4&&cue.end-previous.start<=30&&(!/[.!?]$/.test(previous.text)||cue.end-cue.start<1||rate(previous)>3.5||rate(cue)>3.5)){previous.end=Math.max(previous.end,cue.end);previous.text+=' '+cue.text;}else groups.push({start:cue.start,end:cue.end,text:cue.text});}
 for(let i=0;i<groups.length;i++){const current=groups[i];if(rate(current)<=3.5)continue;const next=groups[i+1],previous=groups[i-1];if(next&&next.start-current.end<=1.2&&next.end-current.start<=16){current.text+=' '+next.text;current.end=next.end;groups.splice(i+1,1);i--;continue;}if(previous&&current.start-previous.end<=1.2&&current.end-previous.start<=16){previous.text+=' '+current.text;previous.end=current.end;groups.splice(i,1);i=Math.max(-1,i-2);}}
 const segments=[];for(const group of groups){const words=group.text.trim().split(/\s+/);if(words.length<3)group.end=Math.min(group.end,group.start+Math.max(1.5,words.length*.65));const parts=phraseParts(group.text,group.end-group.start),total=parts.reduce((n,p)=>n+p.weight,0);let used=0;for(const part of parts){const startTime=group.start+(group.end-group.start)*used/total;used+=part.weight;const endTime=group.start+(group.end-group.start)*used/total;segments.push({index:segments.length,start:startTime,end:endTime,text:part.text});}}
 for(let i=0;i<segments.length;i++){const s=segments[i],wanted=s.text.split(/\s+/).length/3.4-(s.end-s.start);if(wanted<=0)continue;const before=Math.max(0,Math.min(1,s.start-(segments[i-1]?.end||0)-.03)),after=Math.max(0,Math.min(1,(segments[i+1]?.start??duration)-s.end-.03));let left=Math.min(before,wanted/2),right=Math.min(after,wanted-left);left=Math.min(before,wanted-right);s.start-=left;s.end+=right;}
 if(!segments.length||segments.some((s,i)=>!Number.isFinite(s.start)||s.end<=s.start||s.end>duration+.001||i&&s.start<segments[i-1].end-.001))throw Error('Tempos inválidos para dublagem.');const dense=segments.find(s=>s.text.split(/\s+/).length/(s.end-s.start)>5);if(dense){const error=Error('A tradução em '+require('./topic-summary.cjs').clock(dense.start)+' é longa demais para o tempo disponível. Revise esse trecho antes de dublar.');error.segment=dense;throw error;}return segments;
}
async function sourcePauses(source,duration,{signal,offset=0}={}){
 const stat=fs.statSync(source),key=hash(JSON.stringify([source,stat.size,stat.mtimeMs,offset,duration,'silero6.2.3-v2'])).slice(0,20),work=path.join(DATA_DIR,'work','dubbing-alignment-'+key),cache=path.join(work,'pauses.json');
 try{const result=JSON.parse(fs.readFileSync(cache));if(result.detector==='silero-vad-6.2.3-v2'&&result.speech?.length)return result.pauses;}catch{}
 fs.mkdirSync(work,{recursive:true});const input=path.join(work,'input.wav');await require('./media.cjs').execute(path.join(BIN_DIR,'ffmpeg.exe'),['-v','error','-y','-ss',String(offset),'-i',source,'-t',String(duration),'-map','0:a:0','-vn','-sn','-ar','16000','-ac','1','-c:a','pcm_s16le',input],{signal});
 const result=await runWorker({mode:'detect',work,input,duration,segments:[]},{signal});if(!result.speech?.length)throw Error('Não foi encontrada fala no áudio. Confira este vídeo antes de dublar.');fs.writeFileSync(cache,JSON.stringify(result));fs.unlinkSync(input);return result.pauses;
}
async function calibrate(v,{signal,update=()=>{},worker=runWorker}={}){
 v=voice(v);const work=path.join(DATA_DIR,'work','dubbing-calibration-'+Date.now()),texts=['Vamos observar as formas principais do desenho e entender como elas se relacionam com a perspectiva.','Agora ajustamos as proporções do personagem. Observe a posição da cabeça, dos ombros e do quadril antes de acrescentar os detalhes.','Por fim, refinamos o contorno e a iluminação. As sombras ajudam a revelar o volume e a direção das superfícies.'];
 const result=await worker({mode:'benchmark',voice:v,work,duration:30,ffmpeg:path.join(BIN_DIR,'ffmpeg.exe'),segments:texts.map((text,index)=>({index,start:index*10,end:(index+1)*10,text}))},{signal,update});
 if(result.speechSeconds<29||!Number.isFinite(result.synthesisSeconds)||result.synthesisSeconds<=0)throw Error('O teste de velocidade não foi concluído.');
 return{engine:ENGINE,model:MODEL,machine,voice:v,hardware:result.hardware,rtf:result.synthesisSeconds/result.speechSeconds,sampleSeconds:result.speechSeconds,loadSeconds:result.loadSeconds,measuredSeconds:result.synthesisSeconds,measuredAt:new Date().toISOString()};
}
async function dub(item,{signal,update=()=>{},voice:v='male',worker=runWorker,segments:givenSegments,detectPauses=sourcePauses}={}){
 v=voice(v);if(item.subtitles?.language!=='pt')throw Error('Prepare a tradução completa em português antes de dublar.');
 const targetStat=fs.statSync(item.output);
 const source=item.dubbing?.originalVideo&&fs.existsSync(item.dubbing.originalVideo)?item.dubbing.originalVideo:item.output,media=require('./media.cjs'),info=await media.probe(source,signal);
 if(info.duration>86400)throw Error('Divida aulas com mais de 24 horas antes de dublar.');
 const caption=item.subtitles.alignedSrt&&fs.existsSync(item.subtitles.alignedSrt)?item.subtitles.alignedSrt:item.subtitles.srt,content=fs.readFileSync(caption,'utf8');if(/\p{Script=Han}/u.test(content))throw Error('A tradução ainda contém texto chinês. Revise antes de dublar.');
 update({phase:'Conferindo pausas e entrada das falas no áudio original',progress:0});const pauses=givenSegments?[]:await detectPauses(source,info.duration,{signal});
 const stat=fs.statSync(source),identity=[ENGINE,MODEL,v,source,stat.size,stat.mtimeMs,content,givenSegments||null,pauses],fingerprint=hash(JSON.stringify([...identity,'adaptive-fit-2'])),work=path.join(DATA_DIR,'work','dubbing-'+fingerprint.slice(0,20)),previousWork=path.join(DATA_DIR,'work','dubbing-'+hash(JSON.stringify(identity)).slice(0,20)),segments=givenSegments||makeSegments(require('./captions.cjs').parseDisplay(content),info.duration,pauses);
 fs.mkdirSync(work,{recursive:true});const result=await worker({voice:v,work,previousWork,duration:info.duration,segments,ffmpeg:path.join(BIN_DIR,'ffmpeg.exe')},{signal,update:p=>update({...p,progress:(p.progress||0)*.9})});signal?.throwIfAborted();
 update({phase:'Montando vídeo com voz em português · imagem preservada',stage:'dubbing-assembly',progress:92,estimatedRemainingSeconds:null});
 const temporaryFolder=path.join(item.libraryRoot||path.dirname(item.output),'Arquivos de apoio','.dublagem');fs.mkdirSync(temporaryFolder,{recursive:true});const temporary=path.join(temporaryFolder,fingerprint.slice(0,12)+'.mp4'),ffmpeg=path.join(BIN_DIR,'ffmpeg.exe');
 await media.execute(ffmpeg,['-v','error','-y','-i',source,'-i',result.audio,'-map','0:v:0','-map','1:a:0','-map_metadata','0','-map_chapters','0','-c:v','copy','-c:a','aac','-b:a','160k','-t',String(info.duration),'-metadata:s:a:0','language=por','-disposition:a:0','default','-movflags','+faststart',temporary],{signal});
 const checked=await media.inspect(temporary,{signal});const probe=await media.probe(temporary,signal);if(probe.audioCount!==1||probe.audio.tags?.language!=='por'||!checked.audioSignal||Math.abs(checked.duration-info.duration)>.2)throw Error('A dublagem final não passou na verificação. O original foi preservado.');
 const current=fs.statSync(source),targetNow=fs.statSync(item.output);if(current.size!==stat.size||current.mtimeMs!==stat.mtimeMs||targetNow.size!==targetStat.size||targetNow.mtimeMs!==targetStat.mtimeMs)throw Error('O vídeo mudou durante a dublagem.');signal?.throwIfAborted();
 const support=path.join(item.libraryRoot||path.dirname(item.output),'Arquivos de apoio','Versões anteriores');fs.mkdirSync(support,{recursive:true});const backup=path.join(support,(item.dubbing?.originalVideo?'Dublagem':'Vídeo-original')+'-'+Date.now()+'.mp4');
 const metadata={status:'done',engine:ENGINE,model:MODEL,voice:v,fingerprint,originalVideo:item.dubbing?.originalVideo||backup,previousVideo:backup,createdAt:new Date().toISOString(),hardware:result.hardware,synthesisSeconds:result.synthesisSeconds,speechSeconds:result.speechSeconds,videoCopied:true,media:checked};
 const temporaryStat=fs.statSync(temporary),journal={itemId:item.id,output:item.output,backup,temporary,outputSize:temporaryStat.size,outputMtimeMs:temporaryStat.mtimeMs,sourceSize:stat.size,sourceMtimeMs:stat.mtimeMs,metadata},journalFile=path.join(work,'publish.json');fs.writeFileSync(journalFile+'.tmp',JSON.stringify(journal));fs.renameSync(journalFile+'.tmp',journalFile);
 fs.renameSync(item.output,backup);try{fs.renameSync(temporary,item.output);}catch(error){if(!fs.existsSync(item.output))fs.renameSync(backup,item.output);throw error;}
 return metadata;
}
function recoverDubs(state,dataDir=DATA_DIR){let count=0;const work=path.join(dataDir,'work');if(!fs.existsSync(work))return count;
 for(const folder of fs.readdirSync(work,{withFileTypes:true}).filter(e=>e.isDirectory()&&!e.isSymbolicLink()&&/^dubbing-[a-f0-9]{20}$/.test(e.name))){try{
  const record=JSON.parse(fs.readFileSync(path.join(work,folder.name,'publish.json'))),item=[...(state.jobs||[]),...(state.exports||[])].find(i=>i.id===record.itemId);if(!item||item.output!==record.output||item.dubbing?.fingerprint===record.metadata.fingerprint)continue;
  const root=item.libraryRoot||path.dirname(item.output),inside=file=>{const relative=path.relative(root,file);return relative&&!relative.startsWith('..')&&!path.isAbsolute(relative);};if(![record.backup,record.temporary,record.metadata.originalVideo].every(inside))continue;
  if(!fs.existsSync(item.output)&&fs.existsSync(record.backup)){fs.renameSync(record.backup,item.output);item.dubbingStatus='paused';count++;continue;}
  const output=fs.statSync(item.output),source=fs.statSync(record.metadata.originalVideo);if(output.size!==record.outputSize||Math.abs(output.mtimeMs-record.outputMtimeMs)>1||source.size!==record.sourceSize||Math.abs(source.mtimeMs-record.sourceMtimeMs)>1)continue;
  item.dubbing=record.metadata;item.media=record.metadata.media;item.dubbingStatus='done';item.dubbingError='';count++;
 }catch{}}
 return count;
}
module.exports={voice,makeSegments,sourcePauses,calibrate,dub,recoverDubs,estimate,compatibleBenchmark,machine,ENGINE,MODEL};
