const http=require('node:http');
// Dedicated local requests avoid stale keep-alive sockets and fetch's fixed header timeout.
function localRequest(url,{method='POST',headers={},body,signal,timeoutMs=600000}={}){
 return new Promise((resolve,reject)=>{
  const req=http.request(url,{method,agent:false,headers:{...headers,Connection:'close',...(body?{'Content-Length':Buffer.byteLength(body)}:{})},signal},res=>{
   const chunks=[];let length=0;
   res.on('data',chunk=>{length+=chunk.length;if(length>8*1024*1024){res.destroy(Error('Resposta do tradutor excedeu o limite.'));return;}chunks.push(chunk);});
   res.on('error',reject);res.on('aborted',()=>reject(Object.assign(Error('Conexão do tradutor interrompida.'),{code:'ECONNRESET'})));
   res.on('end',()=>{if(!res.complete)return reject(Object.assign(Error('Resposta do tradutor incompleta.'),{code:'ECONNRESET'}));const text=Buffer.concat(chunks).toString('utf8');resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode,json:async()=>JSON.parse(text)});});
  });
  req.setTimeout(timeoutMs,()=>req.destroy(Object.assign(Error('O tradutor demorou para responder.'),{code:'ETIMEDOUT'})));
  req.on('error',reject);req.end(body);
 });
}
function transportError(error){const codes=['ECONNREFUSED','ECONNRESET','EPIPE','ETIMEDOUT','UND_ERR_SOCKET','UND_ERR_HEADERS_TIMEOUT','UND_ERR_CONNECT_TIMEOUT'];return codes.includes(error?.code)||codes.includes(error?.cause?.code)||error?.message==='fetch failed';}
async function requestWithRecovery(url,options,{request=localRequest,recover=async()=>{},onRetry=()=>{},wait=ms=>new Promise(r=>setTimeout(r,ms)),attempts=6}={}){
 let last;
 for(let attempt=0;attempt<attempts;attempt++){
  options.signal?.throwIfAborted();
  try{const result=await request(url,options);if(result.status>=500){const error=Error('Serviço de tradução temporariamente indisponível: HTTP '+result.status);error.code='ECONNRESET';throw error;}return result;}
  catch(error){if(options.signal?.aborted)throw error;if(!transportError(error))throw error;last=error;if(attempt===attempts-1)break;onRetry(attempt+2,error);await wait(Math.min(15000,1000*2**attempt));try{await recover();}catch(recoveryError){if(options.signal?.aborted)throw recoveryError;last=recoveryError;}}
 }
 const error=Error('Não foi possível reconectar ao tradutor local após '+attempts+' tentativas ('+(last?.cause?.code||last?.code||last?.message)+').');error.transport=true;error.cause=last;throw error;
}
module.exports={localRequest,requestWithRecovery,transportError};
