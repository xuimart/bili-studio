const SCHEME='bilistudio';
function parseDeepLink(value){
 try{
  if(typeof value!=='string'||value.length>2048)return null;const u=new URL(value);
  const id=decodeURIComponent(u.pathname.slice(1)),time=u.searchParams.get('t');
  if(u.protocol!==SCHEME+':'||u.hostname!=='watch'||u.username||u.password||u.port||u.hash||!/^export-[a-zA-Z0-9-]{1,100}$/.test(id)||u.searchParams.getAll('t').length!==1||[...u.searchParams.keys()].some(k=>k!=='t')||!/^\d+(?:\.\d{1,3})?$/.test(time||''))return null;
  const seconds=Number(time);if(!Number.isFinite(seconds)||seconds>604800)return null;return {id,time:seconds};
 }catch{return null;}
}
function timeLink(id,time){const value=SCHEME+'://watch/'+encodeURIComponent(id)+'?t='+Number(time).toFixed(3);if(!parseDeepLink(value))throw Error('Vídeo ou tempo inválidos para o link do sumário.');return value;}
function linkFromArgs(args){return (args||[]).map(parseDeepLink).find(Boolean)||null;}
module.exports={SCHEME,parseDeepLink,timeLink,linkFromArgs};
