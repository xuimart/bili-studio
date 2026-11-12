const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn,spawnSync}=require('node:child_process');
const {CACHE_DIR}=require('./runtime-paths.cjs');
const ROOT=path.join(CACHE_DIR,'dubbing'),PYTHON=path.join(ROOT,'venv','Scripts','python.exe');
const ENGINE='omnivoice-0.2.1-natural-v3',MODEL='c5fdb5ccb189668d56333f77ba2629f4cd7535f4';
const RUNTIME='omnivoice-0.2.1-torch2.8-transformers5.10';
function command(exe,args,{signal,onLine=()=>{},env={}}={}){return new Promise((resolve,reject)=>{const child=spawn(exe,args,{windowsHide:true,shell:false,signal,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});let tail='';for(const stream of [child.stdout,child.stderr]){let pending='';stream.setEncoding('utf8');stream.on('data',text=>{tail=(tail+text).slice(-6000);pending+=text;let at;while((at=pending.indexOf('\n'))>=0){onLine(pending.slice(0,at).trim());pending=pending.slice(at+1);}});}child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error(signal?.aborted?'Dublagem pausada. Os trechos concluídos foram salvos.':tail.slice(-1800)||'O motor de voz não iniciou.')));});}
function runtimeEnv(){return{UV_CACHE_DIR:path.join(ROOT,'cache'),UV_PYTHON_INSTALL_DIR:path.join(ROOT,'python'),UV_LINK_MODE:'copy',PYTHONUTF8:'1',TOKENIZERS_PARALLELISM:'false'};}
async function ensureRuntime({signal,update=()=>{}}={}){
 fs.mkdirSync(ROOT,{recursive:true});const marker=path.join(ROOT,'ready.json');let saved;try{saved=JSON.parse(fs.readFileSync(marker));}catch{}
 if(!fs.existsSync(PYTHON)||saved?.runtime!==RUNTIME&&!saved?.engine?.startsWith('omnivoice-0.2.1-')){
  const tools=require('./runtime-tools.cjs'),uv=path.join(ROOT,'uv.exe');
  if(!fs.existsSync(uv)){update({phase:'Preparando o motor de voz · baixar instalador',progress:0});const zip=path.join(ROOT,'uv.zip');await tools.downloadVerified('https://github.com/astral-sh/uv/releases/download/0.13.7/uv-x86_64-pc-windows-msvc.zip',zip,'0cdc5b38fe5a8168ed6a25814f5ba43c21d313dd3187314fccb37b7cec46e021',p=>update({...p,phase:'Preparando o motor de voz · baixar instalador'}),signal);await command('tar.exe',['-xf',zip,'-C',ROOT],{signal});}
  const env=runtimeEnv(),installed=()=>fs.existsSync(env.UV_PYTHON_INSTALL_DIR)?fs.readdirSync(env.UV_PYTHON_INSTALL_DIR,{withFileTypes:true}).filter(d=>d.isDirectory()&&!d.isSymbolicLink()&&/^cpython-3\.11\.\d+-windows-x86_64-none$/.test(d.name)).map(d=>path.join(env.UV_PYTHON_INSTALL_DIR,d.name,'python.exe')).find(p=>fs.existsSync(p)):null;
  update({phase:'Preparando Python local para a voz · primeira vez',progress:0});if(!installed())try{await command(uv,['python','install','3.11'],{signal,env});}catch(error){if(signal?.aborted||!installed())throw error;}
  const managed=installed();if(!managed)throw Error('Python local não foi preparado.');await command(managed,['-c','import sys; assert sys.version_info[:2] == (3,11)'],{signal,env});if(!fs.existsSync(PYTHON))await command(uv,['venv','--python',managed,path.join(ROOT,'venv')],{signal,env});
  const gpu=spawnSync('nvidia-smi',['--query-gpu=memory.total','--format=csv,noheader,nounits'],{windowsHide:true,encoding:'utf8'});const cuda=gpu.status===0&&Number(gpu.stdout.trim().split(/\r?\n/)[0])>=6000;
  update({phase:'Instalando voz local · componentes podem ocupar vários GB',progress:0});await command(uv,['pip','install','--python',PYTHON,'torch==2.8.0','torchaudio==2.8.0','--index-url','https://download.pytorch.org/whl/'+(cuda?'cu128':'cpu')],{signal,env});
  await command(uv,['pip','install','--python',PYTHON,'omnivoice==0.2.1','transformers==5.10.0','silero-vad==6.2.3'],{signal,env});saved={runtime:RUNTIME,engine:ENGINE,cuda,vad:'6.2.3',createdAt:new Date().toISOString()};fs.writeFileSync(marker,JSON.stringify(saved));
 }
 if(saved?.vad!=='6.2.3'){update({phase:'Preparando detector local de fala',progress:0});await command(path.join(ROOT,'uv.exe'),['pip','install','--python',PYTHON,'silero-vad==6.2.3'],{signal,env:runtimeEnv()});fs.writeFileSync(marker,JSON.stringify({...saved,runtime:RUNTIME,vad:'6.2.3'}));}
 const content=fs.readFileSync(path.join(__dirname,'dubbing-worker.py')),hash=crypto.createHash('sha256').update(content).digest('hex').slice(0,12),worker=path.join(ROOT,'worker-'+hash+'.py');if(!fs.existsSync(worker))fs.writeFileSync(worker,content);
 return {python:PYTHON,worker,root:ROOT,engine:ENGINE,model:MODEL};
}
async function runWorker(plan,{signal,update=()=>{},runtime}={}){
 let last={phase:'Preparando motor de voz',progress:0},result;const forward=event=>{last=event;update(event);},heartbeat=setInterval(()=>update({...last,heartbeat:true}),5000);
 try{runtime||=await ensureRuntime({signal,update:forward});const file=path.join(plan.work,'request.json');fs.mkdirSync(plan.work,{recursive:true});fs.writeFileSync(file,JSON.stringify({...plan,modelRevision:MODEL,engine:ENGINE,cache:path.join(ROOT,'models')}));
 await command(runtime.python,['-u',runtime.worker,file],{signal,env:runtimeEnv(),onLine:line=>{if(line.startsWith('@@DUB@@')){try{const event=JSON.parse(line.slice(7));if(event.result)result=event.result;else forward(event);}catch{}}}});if(!result)throw Error('O motor de voz não entregou o resultado.');return result;
 }catch(error){if(signal?.aborted)throw error;if(/out of memory/i.test(error.message))throw Error('A placa de vídeo ficou sem memória livre. Feche outros programas pesados e retome a dublagem.');const lastLine=error.message.trim().split(/\r?\n/).at(-1);throw Error(lastLine.slice(0,500));}finally{clearInterval(heartbeat);}
}
module.exports={ensureRuntime,runWorker,command,ENGINE,MODEL};
