// Offline maintenance. The application performs the same migration when idle.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {organizeLibraries}=require('../library-files.cjs');
function main(){
 const profile=path.resolve(process.argv[2]||path.join(process.env.LOCALAPPDATA,'Bili Studio'));
 if(process.platform==='win32'){
  const running=execFileSync('powershell.exe',['-NoProfile','-Command',"@(Get-Process -Name 'Bili Studio' -ErrorAction SilentlyContinue).Count"],{windowsHide:true,encoding:'utf8'}).trim();
  if(running!=='0')throw Error('Feche o Bili Studio antes da manutenção offline.');
 }
 const file=path.join(profile,'state.json'),bytes=fs.readFileSync(file),state=JSON.parse(bytes);
 if(state.busy||state.auditing||state.queueEnabled||state.operation?.status==='running')throw Error('Há trabalho pendente no estado. Retome ou pause pelo aplicativo antes da manutenção.');
 const before=[...(state.jobs||[]),...(state.exports||[])].filter(i=>i.output&&fs.existsSync(i.output)).map(i=>({id:i.id,output:i.output,bytes:fs.statSync(i.output).size,mtime:fs.statSync(i.output).mtimeMs}));
 const backup=file+'.antes-organizacao-'+Date.now();fs.copyFileSync(file,backup,fs.constants.COPYFILE_EXCL);
 const result=organizeLibraries(state,profile);
 if(!fs.readFileSync(file).equals(bytes))throw Error('O estado mudou durante a manutenção. Os movimentos estão no diário; reabra o aplicativo para reconciliar.');
 const records=[...(state.jobs||[]),...(state.exports||[])];
 for(const original of before){const item=records.find(i=>i.id===original.id),stat=fs.statSync(item.output);if(stat.size!==original.bytes||Math.abs(stat.mtimeMs-original.mtime)>1)throw Error('Arquivo de vídeo mudou na organização: '+original.id);}
 const references=[];
 function visit(obj){if(!obj||typeof obj!=='object')return;for(const [key,value]of Object.entries(obj)){if(typeof value==='string'&&['srt','vtt','txt','alignedSrt','displayAlignedSrt','mapping','playbackSrt','translationCheckpointFile'].includes(key)&&path.isAbsolute(value))references.push({key,file:value});else if(value&&typeof value==='object')visit(value);}}
 visit(state.exports);const missing=references.filter(r=>!fs.existsSync(r.file));
 fs.writeFileSync(file+'.tmp',JSON.stringify(state,null,2));fs.renameSync(file+'.tmp',file);
 const roots=[...new Set(state.exports.map(i=>i.libraryRoot).filter(Boolean))];
 const report={...result,backup,verifiedVideos:before.length,missingReferences:missing,roots:roots.map(root=>({root,files:fs.readdirSync(root).filter(n=>fs.statSync(path.join(root,n)).isFile())})),stateSha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')};
 fs.writeFileSync(path.join(profile,'library-files-report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));if(result.warnings.length||missing.length)process.exitCode=2;
}
try{main();}catch(error){console.error(error.stack);process.exitCode=1;}
