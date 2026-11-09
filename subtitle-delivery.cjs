const fs=require('node:fs'),path=require('node:path');
function subtitleDelivery(item,state={}){
 const queue=(state.linkQueue||[]).find(q=>q.resultId===item.id||(!q.processing?.merge&&q.jobIds?.includes(item.id)));
 const current=state.operation?.currentId===item.id||state.operation?.resultId===item.id;
 const requested=item.subtitleDelivery?.requestedLanguage||(queue?.processing?.subtitles?queue.processing.subtitleLanguage:null)||(current?state.workflow?.subtitleLanguage:null);
 const phase=item.subtitleDelivery?.status||(current?state.operation?.status:null),actual=item.subtitles;
 if(requested==='pt'&&actual?.language!=='pt')return {ready:false,requestedLanguage:'pt',status:phase==='error'?'error':'pending',notice:phase==='error'?'A tradução para português falhou. Retome o processamento; a transcrição original foi preservada.':'A legenda em português ainda está sendo preparada.'};
 if(!actual?.srt)return {ready:false,requestedLanguage:requested,status:phase||'none',notice:'Ainda não há legenda disponível para este vídeo.'};
 return {ready:true,requestedLanguage:requested,status:'ready',notice:actual.language==='pt'?'Legenda em português.':'Legenda no idioma original · '+(actual.language==='zh'?'mandarim':actual.language||'detectado')+'.'};
}
function applySubtitleRepairs(state,dataDir){
 if(state.busy||state.auditing||state.queueEnabled||state.operation?.status==='running')return 0;
 let applied=0;
 for(const item of state.exports||[])if(item.subtitleDelivery?.archiveWarnings?.length&&item.subtitles?.language==='pt'){
  const before=JSON.stringify(item.subtitleDelivery.archiveWarnings),warnings=organizeCaptionFiles(item,item.subtitles);item.subtitleDelivery.archiveWarnings=warnings;if(JSON.stringify(warnings)!==before)applied++;
 }
 const folder=path.join(dataDir,'subtitle-repairs');if(!fs.existsSync(folder))return applied;
 for(const name of fs.readdirSync(folder).filter(n=>/^export-[a-f0-9-]+\.json$/.test(n))){
  const file=path.join(folder,name);
  try{
   const repair=JSON.parse(fs.readFileSync(file,'utf8')),item=state.exports.find(e=>e.id===repair.exportId);
   if(!item||path.resolve(repair.output)!==path.resolve(item.output))throw Error('Resultado não corresponde ao vídeo da biblioteca.');
   const stat=fs.statSync(item.output);
   if(stat.size!==repair.video?.size||Math.abs(stat.mtimeMs-repair.video?.mtimeMs)>1)throw Error('O vídeo mudou desde a recuperação.');
   const captions=repair.subtitles;
   if(captions?.language!=='pt'||!captions.translated||!captions.original?.srt)throw Error('Recuperação não contém tradução portuguesa completa.');
   const {parseSrt}=require('./translate.cjs'),raw=parseSrt(fs.readFileSync(captions.original.srt,'utf8')),aligned=parseSrt(fs.readFileSync(captions.alignedSrt,'utf8'));
   if(raw.length!==aligned.length||aligned.some((c,i)=>c.time!==raw[i].time||/\p{Script=Han}/u.test(c.text)))throw Error('Tradução incompleta ou com idioma incorreto.');
   const display=fs.readFileSync(captions.srt,'utf8');if(/\p{Script=Han}/u.test(display))throw Error('Legenda de exibição contém texto chinês.');
   require('./captions.cjs').validateDisplay(display,parseSrt(fs.readFileSync(captions.displayAlignedSrt,'utf8')));
   if(!captions.vtt||!/^WEBVTT/.test(fs.readFileSync(captions.vtt,'utf8'))||/\p{Script=Han}/u.test(fs.readFileSync(captions.vtt,'utf8')))throw Error('VTT não contém uma legenda portuguesa válida.');
   const alias=item.output.replace(/\.mp4$/i,'')+'.srt';require('./captions.cjs').write(alias,display);captions.playbackSrt=alias;
   const archiveWarnings=organizeCaptionFiles(item,captions);
   if(item.subtitles)(item.subtitleHistory||=[]).push(item.subtitles);
   item.subtitles=captions;item.subtitleSource=captions.original;item.subtitleDelivery={requestedLanguage:'pt',status:'done',completedAt:repair.createdAt,archiveWarnings};
   if(state.operation?.status==='error'&&state.operation.resultId===item.id){Object.assign(state.operation,{status:'done',phase:'Legenda em português recuperada. Arquivos prontos.',error:'',progress:100,completed:state.operation.total,completedAt:repair.createdAt});if(state.workflow?.status==='error')state.workflow.status='done';}
   for(const q of state.linkQueue||[])if(q.resultId===item.id&&q.status==='error'){q.status='done';q.error='';}
   fs.writeFileSync(file+'.tmp',JSON.stringify({...repair,subtitles:captions,appliedAt:new Date().toISOString()},null,2));fs.renameSync(file+'.tmp',file);
   fs.renameSync(file,file.replace(/\.json$/,'.applied.json'));applied++;
  }catch(error){try{fs.writeFileSync(file+'.error.txt',error.message);}catch{}}
 }
 return applied;
}
function organizeCaptionFiles(item,captions){
 const root=path.resolve(path.dirname(item.output)),stem=path.basename(item.output,'.mp4'),warnings=[];
 function move(source,folder){
  const resolved=path.resolve(source);if(path.dirname(resolved)!==root||!fs.existsSync(resolved))return source;
  const dir=path.resolve(root,folder);if(!dir.startsWith(root+path.sep))throw Error('Pasta de legenda fora da biblioteca.');
  fs.mkdirSync(dir,{recursive:true});let target=path.join(dir,path.basename(resolved));if(fs.existsSync(target))target=path.join(dir,path.basename(resolved,path.extname(resolved))+'.preservado-'+Date.now()+path.extname(resolved));
  if(path.dirname(target)!==dir)throw Error('Destino de legenda inválido.');
  fs.renameSync(resolved,target);return target;
 }
 const previous=item.subtitles?.original||item.subtitles,records=[...(item.subtitleHistory||[]).map(s=>s.original||s),previous,item.subtitleSource,captions.original].filter(Boolean);
 for(const record of records)for(const key of ['srt','vtt','txt']){
  const source=record[key];if(!source||!path.basename(source).startsWith(stem+'.whisper-'))continue;
  try{const target=move(source,'Legendas originais');for(const linked of records){if(linked[key]===source)linked[key]=target;if(linked.sourceRepair?.originalSrt===source)linked.sourceRepair.originalSrt=target;}}catch(error){if(!warnings.includes(error.message))warnings.push(error.message);}
 }
 for(const key of ['alignedSrt','displayAlignedSrt'])if(captions[key]&&/\.(?:aligned|display-aligned)\.srt$/.test(captions[key]))try{captions[key]=move(captions[key],'Dados da legenda');}catch(error){warnings.push(error.message);}
 return warnings;
}
module.exports={subtitleDelivery,applySubtitleRepairs};
