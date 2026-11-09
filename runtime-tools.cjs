const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
async function fetchRetry(url,options={}, {request=fetch,delay=ms=>new Promise(r=>setTimeout(r,ms))}={}){
  let last;
  for(let attempt=0;attempt<5;attempt++){
    options.signal?.throwIfAborted();
    try{
      const response=await request(url,options);
      if(![408,429,500,502,503,504].includes(response.status)||attempt===4)return response;
      await response.body?.cancel();last=Error('HTTP '+response.status);
    }catch(error){last=error;if(options.signal?.aborted)throw error;}
    if(attempt<4)await delay(Math.min(8000,500*2**attempt));
  }
  throw last;
}
async function downloadVerified(url,file,expected,update=()=>{},signal){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const r=await fetchRetry(url,{signal:AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(1800000)])});
  if(!r.ok)throw Error('Não foi possível baixar o componente (HTTP '+r.status+'). Verifique sua conexão e tente novamente.');
  const total=Number(r.headers.get('content-length')),hash=crypto.createHash('sha256');let count=0,last=0;
  const handle=await fs.promises.open(file+'.download','w');
  try{for await(const chunk of r.body){signal?.throwIfAborted();hash.update(chunk);let offset=0;while(offset<chunk.length){const n=await handle.write(chunk,offset,chunk.length-offset);if(!n.bytesWritten)throw Error('Falha ao gravar o componente.');offset+=n.bytesWritten;}count+=chunk.length;if(Date.now()-last>250){update({received:count,total,progress:total?count/total*100:0});last=Date.now();}}}finally{await handle.close();}
  if(hash.digest('hex')!==expected.toLowerCase())throw Error('A verificação de integridade falhou. Abra o programa novamente para tentar baixar o componente.');
  fs.renameSync(file+'.download',file);return file;
}
async function extractZip(zip,dir){
  fs.mkdirSync(dir,{recursive:true});
  await new Promise((resolve,reject)=>{const c=spawn('tar.exe',['-xf',zip,'-C',dir],{windowsHide:true,stdio:'ignore'});c.on('error',reject);c.on('close',code=>code===0?resolve():reject(Error('Não foi possível extrair o componente.')));});
}
function findFile(dir,name){if(!fs.existsSync(dir))return null;for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isFile()&&item.name===name)return file;if(item.isDirectory()){const found=findFile(file,name);if(found)return found;}}return null;}
async function ensureTools(bin,update=()=>{}){
  fs.mkdirSync(bin,{recursive:true});
  if(!fs.existsSync(path.join(bin,'ffmpeg.exe'))||!fs.existsSync(path.join(bin,'ffprobe.exe'))){
    update({phase:'Preparando FFmpeg para vídeo e áudio',progress:0});
    const archive=path.join(bin,'ffmpeg.zip'),unpacked=path.join(bin,'ffmpeg-package');
    let url,sha,lastError,complete=false;
    const sources=[];
    try{
      const r=await fetchRetry('https://api.github.com/repos/GyanD/codexffmpeg/releases/latest',{signal:AbortSignal.timeout(60000)});
      if(!r.ok)throw Error('GitHub HTTP '+r.status);
      const release=await r.json(),asset=release.assets?.find(a=>/^ffmpeg-[\w.-]+-essentials_build\.zip$/.test(a.name));
      if(!asset?.digest?.startsWith('sha256:'))throw Error('Checksum oficial ausente.');
      sources.push({url:asset.browser_download_url,sha:asset.digest.slice(7)});
      sources.push({url:'https://www.gyan.dev/ffmpeg/builds/packages/'+asset.name,sha:asset.digest.slice(7)});
    }catch(error){lastError=error;}
    if(!sources.length){
      const fallback='https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';
      const r=await fetchRetry(fallback+'.sha256',{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Não foi possível conferir a integridade do FFmpeg (HTTP '+r.status+').');
      sources.push({url:fallback,sha:(await r.text()).trim().split(/\s+/)[0]});
    }
    for(const source of sources){
      if(!/^[a-f0-9]{64}$/i.test(source.sha))throw Error('Checksum do FFmpeg inválido.');
      try{await downloadVerified(source.url,archive,source.sha,p=>update({...p,phase:'Baixando FFmpeg · vídeo e áudio'}));url=source.url;sha=source.sha;complete=true;break;}catch(error){lastError=error;}
    }
    if(!complete)throw Error('Não foi possível preparar FFmpeg nas fontes oficiais. '+lastError?.message);
    await extractZip(archive,unpacked);
    for(const name of ['ffmpeg.exe','ffprobe.exe']){const source=findFile(unpacked,name);if(!source)throw Error('FFmpeg não encontrado no pacote.');fs.copyFileSync(source,path.join(bin,name));}
    fs.writeFileSync(path.join(bin,'ffmpeg-origin.json'),JSON.stringify({url,sha256:sha,installedAt:new Date().toISOString()}));
    // Keep the package's licenses and documentation; remove only our downloaded archive.
    fs.unlinkSync(archive);
  }
  if(!fs.existsSync(path.join(bin,'yt-dlp.exe'))){
    update({phase:'Preparando leitor do Bilibili',progress:0});
    const releaseResponse=await fetchRetry('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest',{signal:AbortSignal.timeout(60000)});
    if(!releaseResponse.ok)throw Error('Não foi possível consultar o leitor do Bilibili. Tente novamente mais tarde.');
    const release=await releaseResponse.json();if(!/^[\w.-]+$/.test(release.tag_name||''))throw Error('Release oficial inválida.');
    const url='https://github.com/yt-dlp/yt-dlp/releases/download/'+release.tag_name+'/';
    const r=await fetchRetry(url+'SHA2-256SUMS',{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Não foi possível conferir a integridade do yt-dlp.');
    const sha=(await r.text()).split(/\r?\n/).find(l=>/\s+\*?yt-dlp\.exe$/.test(l))?.split(/\s+/)[0];if(!sha)throw Error('Checksum do yt-dlp ausente.');
    await downloadVerified(url+'yt-dlp.exe',path.join(bin,'yt-dlp.exe'),sha,p=>update({...p,phase:'Baixando leitor do Bilibili'}));
  }
}
async function ensureOllama(dir,update=()=>{},signal){
  const existing=findFile(dir,'ollama.exe');if(existing)return existing;
  const r=await fetchRetry('https://api.github.com/repos/ollama/ollama/releases/latest',{headers:{Accept:'application/vnd.github+json'},signal});if(!r.ok)throw Error('Não foi possível consultar o Ollama oficial.');
  const release=await r.json(),asset=release.assets.find(a=>a.name==='ollama-windows-amd64.zip');
  if(!asset?.digest?.startsWith('sha256:'))throw Error('A versão oficial do Ollama não forneceu checksum. Tente novamente mais tarde.');
  const zip=path.join(dir,'ollama.zip');
  await downloadVerified(asset.browser_download_url,zip,asset.digest.slice(7),p=>update({...p,phase:'Instalando tradução local · Ollama'}),signal);
  await extractZip(zip,dir);fs.unlinkSync(zip);const exe=findFile(dir,'ollama.exe');if(!exe)throw Error('Ollama não encontrado no pacote oficial.');return exe;
}
module.exports={ensureTools,ensureOllama,downloadVerified,findFile,fetchRetry};
