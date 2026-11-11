// Repair a failed PT translation without downloading or transcribing the video again.
const fs=require('node:fs'),path=require('node:path');
const profile=path.resolve(process.env.BILI_RECOVERY_PROFILE||path.join(process.env.LOCALAPPDATA,'Bili Studio'));
process.env.BILI_DATA_DIR=profile;process.env.BILI_CACHE_DIR=path.join(profile,'components');process.env.BILI_BIN_DIR=path.join(profile,'components','tools');
const {parseSrt,translateCaptions}=require('../translate.cjs');
async function main(){
 const state=JSON.parse(fs.readFileSync(path.join(profile,'state.json'),'utf8'));
 const id=process.argv[2]||state.operation?.resultId,item=state.exports.find(e=>e.id===id);
 if(!item||!/^export-[a-f0-9-]+$/.test(item.id))throw Error('Informe um resultado de vídeo unido da biblioteca.');
 if(state.busy||state.operation?.status==='running')throw Error('Aguarde o trabalho atual terminar antes de iniciar a recuperação.');
 let original=item.subtitleSource||item.subtitles?.original||item.subtitles;
 const overrideFile=path.join(profile,'subtitle-source-repairs',item.id+'.json');if(fs.existsSync(overrideFile)){const override=JSON.parse(fs.readFileSync(overrideFile,'utf8'));if(override.output!==item.output)throw Error('Correção de fonte não corresponde ao vídeo.');original=override.original;}
if(!original?.srt||!fs.existsSync(original.srt))throw Error('Transcrição original não encontrada.');
 const source=parseSrt(fs.readFileSync(original.srt,'utf8')),videoStat=fs.statSync(item.output),base=require('../library-files.cjs').captionBase(item);
 const statusFile=path.join(profile,'portuguese-recovery-status.json'),lock=path.join(profile,'portuguese-recovery-'+item.id+'.lock');
 try{const previous=JSON.parse(fs.readFileSync(lock));try{process.kill(previous.pid,0);throw Error('Já existe uma recuperação em andamento.');}catch(e){if(e.code!=='ESRCH')throw e;}fs.unlinkSync(lock);}catch(e){if(e.code!=='ENOENT')throw e;}
 fs.writeFileSync(lock,JSON.stringify({pid:process.pid,createdAt:new Date().toISOString()}),{flag:'wx'});
 const checkpoint=base+'.progress.json',old=original.srt.replace(/\.srt$/i,'')+'.pt-BR.progress.json';
 if(!fs.existsSync(checkpoint)&&fs.existsSync(old))fs.copyFileSync(old,checkpoint);
 const status={status:'running',exportId:id,total:source.length,startedAt:new Date().toISOString(),pid:process.pid};let last=0;
 function update(p){Object.assign(status,p,{updatedAt:new Date().toISOString()});if(Date.now()-last>750){fs.writeFileSync(statusFile,JSON.stringify(status,null,2));last=Date.now();}}
 update({phase:'Retomando tradução preservada',progress:0});
 try{
  const translated=await translateCaptions(original,{outputBase:base,update});
  const aligned=parseSrt(fs.readFileSync(translated.alignedSrt,'utf8'));
  if(aligned.length!==source.length||aligned.some((c,i)=>c.time!==source[i].time||/\p{Script=Han}/u.test(c.text)))throw Error('A tradução final não passou pela validação de completude/idioma.');
  const display=fs.readFileSync(translated.srt,'utf8');if(/\p{Script=Han}/u.test(display))throw Error('A legenda de exibição ainda contém texto chinês.');
  require('../captions.cjs').validateDisplay(display,parseSrt(fs.readFileSync(translated.displayAlignedSrt,'utf8')));
  const alias=item.output.replace(/\.mp4$/i,'')+'.srt';require('../captions.cjs').write(alias,display);translated.playbackSrt=alias;
  const repairs=path.join(profile,'subtitle-repairs');fs.mkdirSync(repairs,{recursive:true});
  const result={version:1,exportId:id,output:item.output,video:{size:videoStat.size,mtimeMs:videoStat.mtimeMs},subtitles:translated,createdAt:new Date().toISOString()};
  const file=path.join(repairs,id+'.json');fs.writeFileSync(file+'.tmp',JSON.stringify(result,null,2));fs.renameSync(file+'.tmp',file);
  Object.assign(status,{status:'done',phase:'Legenda em português pronta',progress:100,srt:alias,sourceCues:source.length,translatedCues:aligned.length,readability:translated.readability,completedAt:new Date().toISOString()});
  fs.writeFileSync(statusFile,JSON.stringify(status,null,2));console.log(JSON.stringify({status:'done',srt:alias,sourceCues:source.length,translatedCues:aligned.length},null,2));
 }catch(e){Object.assign(status,{status:'error',error:e.message,updatedAt:new Date().toISOString()});fs.writeFileSync(statusFile,JSON.stringify(status,null,2));throw e;}finally{fs.unlinkSync(lock);}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
