function busy(state){return !!(state.busy||state.auditing||state.discovering||state.queueEnabled||state.operation?.status==='running'||state.components?.status==='running');}
function canInstall(state,downloaded){return downloaded&&!busy(state);}
function allowedExternal(value){try{const u=new URL(value);return u.protocol==='https:'&&['github.com','www.bilibili.com','bilibili.com','ollama.com'].includes(u.hostname)&&!u.username&&!u.password&&!u.port;}catch{return false;}}
module.exports={busy,canInstall,allowedExternal};
