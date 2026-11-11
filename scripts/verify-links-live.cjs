// Read-only online metadata probes. Does not use cookies, download libraries or bypass access.
const fs=require('node:fs'),path=require('node:path');
const {discover,normalizeUrl,initialState}=require('../library.cjs');
const {DATA_DIR}=require('../runtime-paths.cjs');
async function main(){
 const base='https://www.bilibili.com/video/BV1Q3411772i/';
 const cases=[['BV',base],['zh-Hans',base.replace('/video/','/zh-Hans/video/')],['PT-BR e parte',base.replace('/video/','/pt-BR/video/')+'?p=3&spm_id_from=test'],['Móvel',base.replace('www.','m.')],['Player incorporado','https://player.bilibili.com/player.html?bvid=BV1Q3411772i'],['Curto b23','https://b23.tv/BV1Q3411772i'],['Bangumi','https://www.bilibili.com/bangumi/play/ep21495/']];
 if(process.argv[2])cases.push(['Vídeo adicional',normalizeUrl(process.argv[2])]);
 try{const r=await fetch(base,{headers:{'User-Agent':'Mozilla/5.0',Referer:'https://www.bilibili.com/'},signal:AbortSignal.timeout(15000)});if(r.ok){const v=initialState(await r.text()).videoData;if(v?.aid)cases.push(['AV','https://www.bilibili.com/video/av'+v.aid+'/']);if(v?.ugc_season?.id&&v?.owner?.mid)cases.push(['Coleção do autor',`https://space.bilibili.com/${v.owner.mid}/lists/${v.ugc_season.id}?type=season`]);}}catch{}
 const results=[];for(const [kind,url]of cases){const start=Date.now();try{const result=await discover(url);if(!result.entries.length||new Set(result.entries.map(e=>e.id)).size!==result.entries.length)throw Error('Lista vazia ou duplicada.');results.push({kind,url,canonical:normalizeUrl(url),status:'passed',entries:result.entries.length,duration:result.duration,milliseconds:Date.now()-start});console.log('PASS '+kind+' · '+result.entries.length+' vídeos');}catch(e){results.push({kind,url,status:'unavailable',error:e.message,milliseconds:Date.now()-start});console.log('INDISPONÍVEL '+kind+' · '+e.message.slice(0,180));}}
 const report={at:new Date().toISOString(),scope:'Consultas reais de metadados sem cookies; indisponível não significa download certificado nem cobertura de restrições de acesso.',results};fs.mkdirSync(DATA_DIR,{recursive:true});fs.writeFileSync(path.join(DATA_DIR,'links-live-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({tested:results.length,passed:results.filter(r=>r.status==='passed').length,unavailable:results.filter(r=>r.status==='unavailable').length}));
 if(!results.some(r=>r.status==='passed'))process.exitCode=1;
}main().catch(e=>{console.error(e);process.exitCode=1;});
