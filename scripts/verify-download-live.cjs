const fs=require('node:fs'),path=require('node:path');
const {discover}=require('../library.cjs'),{buildArgs}=require('../server.cjs'),media=require('../media.cjs'),{BIN_DIR,DATA_DIR}=require('../runtime-paths.cjs');
async function main(){
 const url=process.argv[2];if(!url)throw Error('Informe o link de um episódio público de até 30 segundos.');
 const page=Number(new URL(url).searchParams.get('p'))||1,library=await discover(url),entry=library.entries.find(e=>e.page===page);if(!entry||!entry.duration||entry.duration>30)throw Error('Amostra precisa ter duração conhecida de até 30 segundos.');
 const work=path.join(DATA_DIR,'live-download-'+Date.now());fs.mkdirSync(work,{recursive:true});
 const args=buildArgs(entry,{target:work,quality:'360',ffmpeg:BIN_DIR,cookieFile:''});
 const result=await media.execute(path.join(BIN_DIR,'yt-dlp.exe'),args);const match=result.stdout.match(/@@FILE@@(.+)/);if(!match)throw Error('Download não entregou arquivo final.');
 const output=await media.finalizeDownload(JSON.parse(match[1])),checked=await media.inspect(output);await media.execute(path.join(BIN_DIR,'ffmpeg.exe'),['-v','error','-i',output,'-f','null','NUL']);
 if(!checked.audioVerified||checked.duration<1)throw Error('Amostra inválida.');const report={at:new Date().toISOString(),url:entry.url,status:'passed',output,...checked};fs.writeFileSync(path.join(DATA_DIR,'download-live-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}main().catch(e=>{console.error(e);process.exitCode=1;});
