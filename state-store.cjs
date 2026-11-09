const fs = require('node:fs');

// A locked destination must never terminate downloads or FFmpeg. The .tmp file
// is a recoverable snapshot; startup reads the newest complete JSON snapshot.
function loadState(file, io = fs) {
  const candidates=[];
  for(const name of [file,file+'.tmp']) {
    try { candidates.push({value:JSON.parse(io.readFileSync(name,'utf8')),time:io.statSync(name).mtimeMs,pending:name.endsWith('.tmp')?1:0}); } catch {}
  }
  return candidates.sort((a,b)=>b.time-a.time||b.pending-a.pending)[0]?.value || {};
}
function createStateStore(file, snapshot, {io=fs,retryMs=2000,onWarning=()=>{}}={}) {
  let timer=null;
  function write() {
    clearTimeout(timer);timer=null;
    try {io.writeFileSync(file+'.tmp',JSON.stringify(snapshot(),null,2));io.renameSync(file+'.tmp',file);onWarning(null);return true;}
    catch(error){onWarning('O arquivo de progresso está temporariamente bloqueado. O processamento continua e o painel tentará salvar novamente. ('+error.code+')');timer=setTimeout(write,retryMs);timer.unref?.();return false;}
  }
  function persist(immediate=false){if(immediate)return write();if(!timer){timer=setTimeout(write,retryMs);timer.unref?.();}}
  function close(){clearTimeout(timer);timer=null;}
  return {persist,close};
}
module.exports={loadState,createStateStore};
