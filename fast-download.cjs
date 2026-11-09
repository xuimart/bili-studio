const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execute}=require('./media.cjs');
const CHUNK=1024*1024;
// Only verified, contiguous bytes survive an interrupted parallel transfer.
async function downloadRanges(urls,file,{headers={},signal,update=()=>{},request=fetch,chunkSize=CHUNK}={}){
  const partial=file+'.part',marker=partial+'.ranges.json';
  if(fs.existsSync(file))return;
  fs.mkdirSync(path.dirname(file),{recursive:true});
  async function range(start,end,expected){
    let last;
    for(const url of urls){
      try{
        signal?.throwIfAborted();
        const r=await request(url,{headers:{...headers,Range:`bytes=${start}-${end}`},signal:AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(30000)])});
        const m=r.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
        if(r.status!==206||!m||Number(m[1])!==start||Number(m[2])!==Math.min(end,Number(m[3])-1)||(expected&&Number(m[3])!==expected)){await r.body?.cancel();throw Error('Servidor não confirmou o intervalo solicitado.');}
        const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length!==Number(m[2])-start+1)throw Error('Bloco incompleto recebido do servidor.');
        return{bytes,total:Number(m[3])};
      }catch(e){last=e;if(signal?.aborted)throw e;}
    }
    throw Error(`Bloco ${start}-${end} indisponível em ${urls.length} endereço(s): ${last?.message||'download indisponível'}`);
  }
  const first=await range(0,0),total=first.total;
  let prefix=fs.existsSync(partial)?fs.statSync(partial).size:0;
  if(fs.existsSync(marker)){try{const old=JSON.parse(fs.readFileSync(marker,'utf8'));prefix=old.total===total?Math.min(prefix,old.prefix||0):0;}catch{prefix=0;}}
  if(prefix>total)prefix=0;
  const handle=await fs.promises.open(partial,fs.existsSync(partial)?'r+':'w+');
  await handle.truncate(prefix);
  const originalPrefix=prefix,done=new Map();let next=prefix,received=prefix,failure,lastPersist=0;const began=Date.now();
  function save(){fs.writeFileSync(marker,JSON.stringify({total,prefix}));lastPersist=Date.now();}
  save();
  async function worker(){
    while(next<total&&!failure){
      // Bound out-of-order work if one CDN block is slow.
      if(next-prefix>=8*chunkSize){await new Promise(r=>setTimeout(r,20));continue;}
      const start=next,end=Math.min(total-1,start+chunkSize-1);next=end+1;
      try{
        const {bytes}=await range(start,end,total);let written=0;
        while(written<bytes.length){const result=await handle.write(bytes,written,bytes.length-written,start+written);if(!result.bytesWritten)throw Error('Não foi possível gravar o bloco.');written+=result.bytesWritten;}
        done.set(start,bytes.length);received+=bytes.length;
        while(done.has(prefix)){const length=done.get(prefix);done.delete(prefix);prefix+=length;}
        if(Date.now()-lastPersist>1000)save();
        update({downloaded:received,total,speed:(received-originalPrefix)/Math.max(.001,(Date.now()-began)/1000),progress:Math.min(99,received/total*100)});
      }catch(e){failure=e;}
    }
  }
  try{await Promise.all(Array.from({length:4},worker));if(failure)throw failure;if(prefix!==total)throw Error('Transferência incompleta.');}
  finally{await handle.truncate(prefix);await handle.close();save();}
  fs.renameSync(partial,file);fs.unlinkSync(marker);
}

async function prefetch(entry,{ytdlp,target,stem,format,cookieFile,signal,update=()=>{},log=()=>{}}){
  const args=['--write-pages','--ignore-config','--no-playlist','--skip-download','--dump-single-json','--encoding','utf-8','--socket-timeout','15','--retries','2','-f',format];
  if(cookieFile)args.push('--cookies',cookieFile);args.push('--',entry.url);
  const capture=path.join(require('./runtime-paths.cjs').DATA_DIR,'work','extract-'+crypto.randomUUID());fs.mkdirSync(capture,{recursive:true});let info,streams=[];
  try{
    const {stdout}=await execute(ytdlp,args,{signal,cwd:capture});info=JSON.parse(stdout);
    for(const name of fs.readdirSync(capture)){
      try{const data=JSON.parse(fs.readFileSync(path.join(capture,name),'utf8'));if(data.data?.dash)streams=[...(data.data.dash.video||[]),...(data.data.dash.audio||[])];}catch{}
    }
  }finally{
    for(const name of fs.readdirSync(capture)){const file=path.join(capture,name);if(fs.statSync(file).isFile())fs.unlinkSync(file);}fs.rmdirSync(capture);
  }
  if(!info.requested_formats?.length)throw Error('Usando transferência padrão para este formato.');
  for(const format of info.requested_formats){
    if(!/^\d+$/.test(format.format_id)||!['mp4','m4a'].includes(format.ext))throw Error('Formato requer transferência padrão.');
    const file=path.join(target,'.em-andamento',stem+`.f${format.format_id}.${format.ext}`);
    const stream=streams.find(s=>String(s.id)===format.format_id||String(s.baseUrl||s.base_url||'').includes('-'+format.format_id+'.'));
    const urls=[...new Set([format.url,...(stream?[stream.baseUrl||stream.base_url,...(stream.backupUrl||stream.backup_url||[])]:[])])];
    log('Transferência paralela · '+(format.vcodec==='none'?'áudio':'vídeo')+' · 4 conexões');
    await downloadRanges(urls,file,{headers:{...info.http_headers,...format.http_headers},signal,update});
  }
}
module.exports={downloadRanges,prefetch};
