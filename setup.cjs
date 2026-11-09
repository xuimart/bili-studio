const path=require('node:path'),{spawnSync}=require('node:child_process');
async function setup(){
  if(Number(process.versions.node.split('.')[0])<22)throw Error('Desenvolvimento requer Node.js 22 ou superior.');
  const {BIN_DIR}=require('./runtime-paths.cjs');
  await require('./runtime-tools.cjs').ensureTools(BIN_DIR,p=>console.log(p.phase+' · '+Math.round(p.progress||0)+'%'));
  for(const [name,args]of [['ffmpeg.exe',['-version']],['ffprobe.exe',['-version']],['yt-dlp.exe',['--version']]]){
    const r=spawnSync(path.join(BIN_DIR,name),args,{windowsHide:true,encoding:'utf8'});
    if(r.status!==0)throw Error('Não foi possível iniciar '+name);console.log(r.stdout.split(/\r?\n/)[0]);
  }
}
if(require.main===module)setup().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={setup};
