const fs=require('node:fs'),path=require('node:path');
const {discover,normalizeUrl}=require('../library.cjs'),{execute}=require('../media.cjs'),{BIN_DIR,DATA_DIR}=require('../runtime-paths.cjs');
async function main(){
  const current=process.argv.includes('--current-library');
  const state=current?JSON.parse(fs.readFileSync(path.join(DATA_DIR,'state.json'),'utf8')):{};
  const urls=current?[...new Set(state.linkQueue.map(q=>q.url))]:process.argv.slice(2);
  if(!urls.length)throw Error('Informe ao menos uma URL ou --current-library para testar a biblioteca local.');
  const results=[];
  for(const value of urls){
    const url=normalizeUrl(value);
    try{
      const library=await discover(url,state.cookieFile||'');
      const args=['--ignore-config','--skip-download','--dump-single-json','--no-playlist','--socket-timeout','15','--retries','1'];
      if(state.cookieFile)args.push('--cookies',state.cookieFile);
      const {stdout}=await execute(path.join(BIN_DIR,'yt-dlp.exe'),[...args,'--',library.entries[0].url]);const info=JSON.parse(stdout);
      const formats=info.formats||[];
      const result={url,entries:library.entries.length,videoCodecs:[...new Set(formats.map(f=>f.vcodec).filter(x=>x&&x!=='none'))],audioCodecs:[...new Set(formats.map(f=>f.acodec).filter(x=>x&&x!=='none'))],protocols:[...new Set(formats.map(f=>f.protocol).filter(Boolean))],status:'passed'};
      if(!result.videoCodecs.length||!result.audioCodecs.length)throw Error('Nenhuma combinação de vídeo e áudio foi disponibilizada.');
      results.push(result);console.log('PASS '+url+' · '+library.entries.length+' episódios · '+result.videoCodecs.join(', '));
    }catch(e){results.push({url,status:'failed',error:e.message});console.error('FAIL '+url+' · '+e.message.slice(0,200));}
  }
  const report={createdAt:new Date().toISOString(),scope:'Consulta real e inventário de formatos; não baixa todas as mídias novamente.',results};fs.writeFileSync(path.join(DATA_DIR,'bilibili-live-report.json'),JSON.stringify(report,null,2));
  if(results.some(r=>r.status==='failed'))process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
