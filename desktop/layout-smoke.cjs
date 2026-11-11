// Real renderer regression test with synthetic state; never opens user data or downloads.
const {app,BrowserWindow}=require('electron');
app.disableHardwareAcceleration(); // Hidden captures must work without an active GPU session.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const profile=path.resolve('data','layout-smoke-'+Date.now());fs.mkdirSync(profile,{recursive:true});
app.setPath('userData',profile);process.env.BILI_DATA_DIR=profile;process.env.BILI_CACHE_DIR=path.join(profile,'components');
let backend,win;
app.whenReady().then(async()=>{
 backend=require('../server.cjs').createApp({dataDir:profile});
 const state=backend.state;
 state.folder='C:\\Vídeos\\Bili Studio';state.processingPrefs={subtitles:true,merge:false,language:'auto',subtitleLanguage:'pt'};
 state.library={id:'test-library',title:'Vídeos para baixar',entries:Array.from({length:15},(_,i)=>({id:'new-'+i,bvid:'BV1Q3411772i',page:i+1,index:i+1,title:'Aula '+String(i+1).padStart(2,'0')+' · Desenho e construção',duration:120,url:'https://www.bilibili.com/video/BV1Q3411772i/?p='+(i+1)}))};
 state.linkQueue=Array.from({length:9},(_,i)=>({id:'old-'+i,title:'Biblioteca concluída '+(i+1),status:'done',ids:['old-part-'+i],jobIds:[],resultId:'export-'+i,settings:{folder:state.folder},processing:{merge:true,subtitles:true,language:'auto',subtitleLanguage:'pt'}}));
 state.exports=state.linkQueue.map((q,i)=>({id:q.resultId,title:q.title,status:'done',sourceIds:q.ids,duration:120,output:path.join(profile,'old-'+i+'.mp4')}));
 state.workflow={status:'done',ids:[],target:state.folder};state.operation={status:'done'};
 await new Promise(r=>backend.server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+backend.server.address().port;
 win=new BrowserWindow({width:1380,height:930,show:false,backgroundColor:'#15171d',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
 await win.loadURL(base+'/?token='+backend.token);
 const read=()=>win.webContents.executeJavaScript(`(()=>{const r=document.querySelector('.workspace').getBoundingClientRect(),s=document.querySelector('.source').getBoundingClientRect();return {ready:document.documentElement.dataset.ready==='true',workspaceTop:r.top,sourceBottom:s.bottom,historyOpen:document.querySelector('#download-history').open,historyHidden:document.querySelector('#download-history').hidden,queueHidden:document.querySelector('#link-queue-panel').hidden,bannerHidden:document.querySelector('#queue-now').hidden,progressHidden:document.querySelector('#processing-panel').hidden,activeRows:document.querySelector('#link-queue-items').children.length,historyRows:document.querySelector('#link-history-items').children.length,selected:document.querySelector('#selected-count').textContent,workspaceBeforeQueue:!!(document.querySelector('.workspace').compareDocumentPosition(document.querySelector('#link-queue-panel'))&Node.DOCUMENT_POSITION_FOLLOWING),bulkOpen:document.querySelector('#bulk-links').open};})()`);
 let initial;const deadline=Date.now()+15000;do{initial=await read();if(initial.ready)break;await new Promise(r=>setTimeout(r,100));}while(Date.now()<deadline);
 assert.equal(initial.ready,true);assert.equal(initial.queueHidden,true);assert.equal(initial.historyOpen,false);assert.equal(initial.historyRows,9);assert.equal(initial.activeRows,0);assert.equal(initial.bannerHidden,true);assert.equal(initial.progressHidden,true);assert.equal(initial.selected,'15 selecionados');assert.equal(initial.workspaceBeforeQueue,true);assert.ok(initial.workspaceTop-initial.sourceBottom<40);
 fs.writeFileSync(path.join(profile,'history-collapsed.png'),(await win.webContents.capturePage()).toPNG());
 state.exports[0].subtitles={language:'zh',srt:path.join(profile,'original.srt'),vtt:path.join(profile,'original.vtt')};state.exports[0].subtitleDelivery={requestedLanguage:'pt',status:'error'};
 await win.webContents.executeJavaScript('poll()');await win.webContents.executeJavaScript('preview(state.exports[0])');
 const captionGuard=await win.webContents.executeJavaScript('({tracks:document.querySelector("#player").querySelectorAll("track").length,downloadHidden:document.querySelector("#download-srt").hidden,notice:document.querySelector("#preview-caption-status").textContent})');
 assert.equal(captionGuard.tracks,0);assert.equal(captionGuard.downloadHidden,true);assert.match(captionGuard.notice,/português falhou/);await win.webContents.executeJavaScript('document.querySelector("#preview-dialog").close()');

 await win.webContents.executeJavaScript(`document.querySelector('#download-history').open=true;`);
 await win.webContents.executeJavaScript('poll()');
 assert.equal((await read()).historyOpen,true,'Polling não pode recolher um histórico aberto pelo usuário');
 await win.webContents.executeJavaScript(`document.querySelector('#download-history').open=false;document.querySelector('#show-bulk-links').click();`);
 let bulk=await read();assert.equal(bulk.bulkOpen,true);assert.equal(bulk.queueHidden,false);
 await win.webContents.executeJavaScript(`document.querySelector('#bulk-links').open=false;`);
 state.linkQueue[0].status='pending';state.linkQueue[1].status='error';state.linkQueue[1].error='Erro de teste para retomar';
 await win.webContents.executeJavaScript('poll()');const pending=await read();assert.equal(pending.activeRows,2);assert.equal(pending.historyRows,7);assert.equal(pending.queueHidden,false);assert.equal(pending.bannerHidden,false);
 state.linkQueue[0].status='running';state.queueEnabled=true;
 await win.webContents.executeJavaScript('poll()');const active=await read();assert.equal(active.activeRows,2);assert.equal(active.historyRows,7);assert.equal(active.queueHidden,false);
 fs.writeFileSync(path.join(profile,'active-queue.png'),(await win.webContents.capturePage()).toPNG());
 state.fileOrganization={warnings:[{error:'Locked fixture'}]};await win.webContents.executeJavaScript('poll()');
 const organizationWarning=await win.webContents.executeJavaScript('({hidden:document.querySelector("#save-warning").hidden,text:document.querySelector("#save-warning").textContent})');
 assert.equal(organizationWarning.hidden,false);assert.match(organizationWarning.text,/não puderam ser organizados/);
 const report={captionGuard,organizationWarning,version:require('../package.json').version,completedHistory:initial,bulk,pending,active,checks:'Concluídos recolhidos; seleção imediatamente após o link; pendentes/erros/ativo visíveis; histórico permanece aberto durante polling; atalhos de vários links funcionam; organização bloqueada é informada.'};
 fs.writeFileSync(path.join(profile,'layout-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));console.log('Evidência: '+profile);
 state.queueEnabled=false;backend.server.close();app.exit(0);
}).catch(e=>{console.error(e.stack);backend?.server.close();app.exit(1);});
