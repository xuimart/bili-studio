const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
function plan(p={}){return{subtitles:!!p.subtitles,subtitleLanguage:p.subtitleLanguage||'original',language:p.language||'auto',dubbing:!!p.dubbing,voice:p.voice||'male'};}
function captionHash(item){const s=item.subtitles,file=[s?.alignedSrt,s?.srt].find(f=>f&&fs.existsSync(f));return file?crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'):null;}
function complete(item,p){const stat=fs.statSync(item.output);return{...plan(p),status:'done',completedAt:new Date().toISOString(),outputSize:stat.size,outputMtimeMs:stat.mtimeMs,captionHash:captionHash(item),dubbingFingerprint:item.dubbing?.fingerprint};}
function reusable(item,p,engine){const saved=item.processingDelivery;if(saved?.status!=='done'||Object.entries(plan(p)).some(([k,v])=>saved[k]!==v)||!item.output||!fs.existsSync(item.output))return false;const stat=fs.statSync(item.output);if(stat.size!==saved.outputSize||Math.abs(stat.mtimeMs-saved.outputMtimeMs)>1)return false;if(p.subtitles&&(!item.subtitles?.srt||!item.subtitles?.vtt||![item.subtitles.srt,item.subtitles.vtt].every(fs.existsSync)||captionHash(item)!==saved.captionHash||p.subtitleLanguage==='pt'&&item.subtitles.language!=='pt'))return false;if(p.dubbing&&(item.dubbingStatus!=='done'||item.dubbing?.engine!==engine||item.dubbing?.voice!==p.voice||item.dubbing?.fingerprint!==saved.dubbingFingerprint))return false;return true;}
function playback(item,state={}){
 const p=item.processingDelivery,key=file=>file&&(process.platform==='win32'?path.resolve(file).toLowerCase():path.resolve(file)),sameFile=other=>other!==item&&(other.dubbingStatus==='running'||other.processingDelivery?.status==='running')&&item.output&&key(other.output)===key(item.output),changing=item.dubbingStatus==='running'||p?.status==='running'||[...(state.jobs||[]),...(state.exports||[])].some(sameFile);
 if(item.status!=='done'||!item.output)return{playbackReady:false,playbackLabel:'Aguardando download'};
 if(item.media?.audioVerified===false)return{playbackReady:false,playbackLabel:'Conferindo áudio…'};
 if(changing)return{playbackReady:false,playbackLabel:item.dubbingStatus==='running'?'Dublando…':'Preparando legenda…'};
 if(p&&['error','paused'].includes(p.status))return{playbackReady:true,playbackLabel:'Assistir versão disponível',playbackNotice:'O processamento desta aula precisa ser retomado. Você está abrindo a versão preservada.'};
 if(p&&p.status!=='done')return{playbackReady:false,playbackLabel:p.dubbing?'Aguardando legenda e dublagem':'Aguardando legenda'};
 if(item.dubbingStatus==='done'&&item.dubbing?.status==='done')return{playbackReady:true,playbackLabel:'Assistir dublado'};
 const subtitles=require('./subtitle-delivery.cjs').subtitleDelivery(item,state);
 return{playbackReady:true,playbackLabel:subtitles.ready?'Assistir legendado':'Assistir'};
}
module.exports={plan,complete,reusable,playback};
