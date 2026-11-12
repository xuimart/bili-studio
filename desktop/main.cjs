const {app,BrowserWindow,Menu,dialog,shell,powerSaveBlocker,Tray,nativeImage}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const {autoUpdater}=require('electron-updater');
const {busy,canInstall,allowedExternal}=require('./update-policy.cjs');
const {SCHEME,linkFromArgs,parseDeepLink}=require('./deep-links.cjs');
const smoke=process.argv.includes('--smoke-test');
if(process.env.BILI_TEST_PROFILE)app.setPath('userData',process.env.BILI_TEST_PROFILE);
else if(process.platform==='win32'&&process.env.LOCALAPPDATA)app.setPath('userData',path.join(process.env.LOCALAPPDATA,'Bili Studio'));
app.setName('Bili Studio');
app.setAppUserModelId('br.com.xuimart.bilistudio');
let win,backend,base,tray,quitting=false,downloaded=false,blocker,interval,rendererReady=false,pendingLink=linkFromArgs(process.argv);
async function openDeepLink(link){
  if(!link)return null;if(!rendererReady){pendingLink=link;return null;}
  const result=await win.webContents.executeJavaScript('openSummaryTime('+JSON.stringify(link.id)+','+JSON.stringify(link.time)+')',true);
  if(result?.ok){backend.state.logs.push({time:new Date().toISOString(),type:'info',message:'Sumário: '+result.id+' aberto em '+result.time.toFixed(3)+' s.'});backend.state.logs=backend.state.logs.slice(-100);backend.persist();}
  if(!smoke){win.show();if(win.isMinimized())win.restore();win.focus();}
  return result;
}
const acquired=app.requestSingleInstanceLock();
if(!acquired)app.quit();
app.on('second-instance',(_event,args)=>{const link=linkFromArgs(args);if(link)void openDeepLink(link).catch(()=>{});else if(win&&!win.isDestroyed()){win.show();if(win.isMinimized())win.restore();win.focus();}});
app.on('open-url',(event,url)=>{event.preventDefault();const link=parseDeepLink(url);if(link)void openDeepLink(link).catch(()=>{});});
async function shutdown(){
  if(quitting)return;quitting=true;clearInterval(interval);
  if(blocker!==undefined)powerSaveBlocker.stop(blocker);
  if(base&&backend){try{await fetch(base+'/api/shutdown',{method:'POST',headers:{Origin:base,Cookie:'bilibili_session='+backend.token,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(20000)});}catch{}backend.persist(true);}
  tray?.destroy();app.quit();
}
function message(text){if(!smoke)dialog.showMessageBox(win,{type:'info',title:'Bili Studio',message:text});}
function configureUpdates(){
  autoUpdater.autoDownload=false;autoUpdater.autoInstallOnAppQuit=false;
  autoUpdater.on('error',e=>{backend.state.update={status:'error',message:'Não foi possível consultar a atualização. Tente novamente mais tarde.'};backend.persist();});
  autoUpdater.on('update-not-available',()=>message('Você já está usando a versão mais recente.'));
  autoUpdater.on('update-available',async info=>{
    backend.state.update={status:'available',version:info.version};backend.persist();
    const result=await dialog.showMessageBox(win,{type:'info',message:'Bili Studio '+info.version+' disponível',detail:'A atualização preserva sua fila, configurações, vídeos e legendas. Você escolhe quando instalar.',buttons:['Baixar atualização','Depois'],defaultId:0,cancelId:1});
    if(result.response===0)autoUpdater.downloadUpdate().catch(()=>{});
  });
  autoUpdater.on('download-progress',p=>{backend.state.update={status:'downloading',progress:Math.round(p.percent)};backend.persist();});
  autoUpdater.on('update-downloaded',()=>{downloaded=true;backend.state.update={status:'ready'};backend.persist();message('Atualização pronta. Use Ajuda → Instalar atualização quando a fila estiver parada.');});
}
async function checkUpdates(){
  if(!app.isPackaged)return message('As atualizações são habilitadas no aplicativo instalado.');
  backend.state.update={status:'checking'};backend.persist();
  await autoUpdater.checkForUpdates().catch(()=>message('Não foi possível consultar a atualização. Verifique sua conexão.'));
}
function installUpdate(){
  if(!canInstall(backend.state,downloaded))return message(downloaded?'Pause a fila e aguarde o processamento terminar antes de atualizar.':'Nenhuma atualização foi baixada. Use Verificar atualizações.');
  quitting=true;backend.persist(true);autoUpdater.quitAndInstall(false,true);
}
async function migrateLegacy(){
  if(smoke || fs.existsSync(path.join(app.getPath('userData'),'state.json')))return;
  // The development checkout can be migrated once. Never ship an absolute user path.
  const legacy=process.env.BILI_LEGACY_DIR || (!app.isPackaged?path.resolve(__dirname,'../data'):null);
  if(!legacy||!fs.existsSync(path.join(legacy,'state.json')))return;
  const choice=await dialog.showMessageBox({type:'question',title:'Importar biblioteca existente',message:'Encontramos a fila da versão anterior.',detail:'Importar mantém os caminhos dos seus vídeos. Os arquivos não serão movidos.',buttons:['Importar biblioteca','Começar vazia'],defaultId:0,cancelId:1});
  if(choice.response===0){fs.mkdirSync(app.getPath('userData'),{recursive:true});fs.copyFileSync(path.join(legacy,'state.json'),path.join(app.getPath('userData'),'state.json'));}
}
async function importState(){
  if(busy(backend.state))return message('Aguarde o processamento terminar antes de importar uma biblioteca.');
  const result=await dialog.showOpenDialog(win,{title:'Importar biblioteca da versão anterior (state.json)',properties:['openFile'],filters:[{name:'Biblioteca Bili Studio',extensions:['json']}]});
  if(result.canceled)return;
  const {validateImport}=require('./migration.cjs');
  try{
    const text=fs.readFileSync(result.filePaths[0],'utf8');validateImport(text);
    const file=path.join(app.getPath('userData'),'state.json');
    backend.persist(true);if(fs.existsSync(file))fs.copyFileSync(file,file+'.antes-importacao-'+Date.now());
    fs.writeFileSync(path.join(app.getPath('userData'),'pending-import.json'),text);
    message('Biblioteca preparada para importação. Reinicie o aplicativo para concluir.');
  }catch(e){message('Não foi possível importar: '+e.message);}
}
async function start(){
  if(app.isPackaged&&!smoke)app.setAsDefaultProtocolClient(SCHEME,process.execPath,['--']);
  const dataDir=app.getPath('userData');fs.mkdirSync(dataDir,{recursive:true});
  await migrateLegacy();
  const pending=path.join(dataDir,'pending-import.json');
  if(fs.existsSync(pending)){require('./migration.cjs').validateImport(fs.readFileSync(pending,'utf8'));fs.renameSync(pending,path.join(dataDir,'state.json'));}
  process.env.BILI_DATA_DIR=dataDir;
  process.env.BILI_BIN_DIR=app.isPackaged?path.join(dataDir,'components','tools'):path.resolve(__dirname,'../bin');
  process.env.BILI_CACHE_DIR=path.join(dataDir,'components');
  process.env.BILI_DOWNLOAD_DIR=path.join(app.getPath('videos'),'Bili Studio');
  const icon=path.join(__dirname,'icon.png');
  win=new BrowserWindow({width:1380,height:930,minWidth:900,minHeight:650,show:!smoke,backgroundColor:'#15171d',title:'Bili Studio',icon,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,spellcheck:false}});
  win.on('closed',()=>{if(!backend){quitting=true;app.exit(0);}});
  await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src '+"'none'"+'; style-src '+"'unsafe-inline'"+'"><title>Bili Studio</title><body style="background:#15171d;color:#f6f6f9;font:20px Segoe UI;padding:10vh 12vw"><h1>Bili Studio</h1><p id="phase">Preparando o aplicativo no seu computador…</p><progress id="progress" max="100" style="width:100%"></progress><p style="font-size:15px;color:#bbb">Na primeira abertura, baixamos as ferramentas oficiais de vídeo e áudio. Elas ficam salvas para as próximas vezes.</p></body></html>'));
  await require('../runtime-tools.cjs').ensureTools(process.env.BILI_BIN_DIR,p=>{if(!win.isDestroyed())win.webContents.executeJavaScript('document.getElementById("phase").textContent='+JSON.stringify(p.phase)+';document.getElementById("progress").value='+Number(p.progress||0)).catch(()=>{});});
  backend=require('../server.cjs').createApp({exportSummaryDocuments:item=>require('../summary-document.cjs').exportSummaryDocuments(item,{renderPdf:require('./summary-pdf.cjs').renderPdf}),choosePath:async type=>{
    const r=await dialog.showOpenDialog(win,{title:type==='folder'?'Escolha onde salvar os vídeos':'Cookies Netscape do Bilibili',properties:type==='folder'?['openDirectory','createDirectory']:['openFile'],...(type==='folder'?{}:{filters:[{name:'Cookies',extensions:['txt']}]})});return r.canceled?'':r.filePaths[0];
  }});
  await new Promise((resolve,reject)=>{backend.server.once('error',reject);backend.server.listen(0,'127.0.0.1',resolve);});
  base='http://127.0.0.1:'+backend.server.address().port;

  win.webContents.setWindowOpenHandler(({url})=>{if(allowedExternal(url))shell.openExternal(url);return {action:'deny'};});
  win.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==base){event.preventDefault();if(allowedExternal(url))shell.openExternal(url);}});
  win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  win.on('close',async e=>{
    if(quitting)return;e.preventDefault();
    if(busy(backend.state)){
      const r=await dialog.showMessageBox(win,{type:'question',message:'Há trabalho em andamento.',buttons:['Continuar em segundo plano','Manter janela aberta','Pausar e sair'],defaultId:0,cancelId:1});
      if(r.response===0)win.hide();else if(r.response===2)await shutdown();
    }else await shutdown();
  });
  tray=new Tray(nativeImage.createFromPath(icon));tray.setToolTip('Bili Studio');tray.on('double-click',()=>win.show());tray.setContextMenu(Menu.buildFromTemplate([{label:'Abrir Bili Studio',click:()=>win.show()},{label:'Sair',click:()=>win.close()}]));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'Arquivo',submenu:[{label:'Abrir pasta dos vídeos',click:()=>shell.openPath(backend.state.folder)},{label:'Importar biblioteca anterior…',click:importState},{type:'separator'},{label:'Sair',accelerator:'Alt+F4',click:()=>win.close()}]},
    {label:'Editar',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:'Exibir',submenu:[{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]},
    {label:'Ajuda',submenu:[{label:'Verificar atualizações',click:checkUpdates},{label:'Instalar atualização baixada',click:installUpdate},{label:'Documentação',click:()=>shell.openExternal('https://github.com/xuimart/bili-studio#readme')},{label:'Abrir pasta de diagnóstico',click:()=>shell.openPath(dataDir)},{label:'Sobre',click:()=>message('Bili Studio '+app.getVersion()+'\nXuim Art · Processamento local no seu computador.')}]}]));
  if(app.isPackaged&&!smoke)configureUpdates();
  interval=setInterval(()=>{const active=busy(backend.state);if(active&&blocker===undefined)blocker=powerSaveBlocker.start('prevent-app-suspension');if(!active&&blocker!==undefined){powerSaveBlocker.stop(blocker);blocker=undefined;}},2000);
  if(smoke){
    const sample=path.join(dataDir,'smoke-media.mp4'),media=require('../media.cjs');
    await media.execute(path.join(process.env.BILI_BIN_DIR,'ffmpeg.exe'),['-v','error','-f','lavfi','-i','testsrc2=size=256x144:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','1.25','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart','-y',sample]);
    backend.state.jobs.push({id:'smoke-media',status:'done',output:sample,media:await media.inspect(sample)});
    backend.state.exports.push({id:'export-smoke',type:'merged',status:'done',title:'Teste de link do sumário',sourceIds:[],output:sample,media:await media.inspect(sample),duration:1.25,topicSummary:{fingerprint:'smoke',markdown:path.join(dataDir,'smoke-summary.md'),json:path.join(dataDir,'smoke-summary.json'),duration:1.25,topics:[{start:.5,end:1,title:'Forma e proporção',description:'Exemplo sintético para testar o clique no horário.'}]}});
  }
  await win.loadURL(base+'/?token='+backend.token);
  rendererReady=true;if(pendingLink){const link=pendingLink;pendingLink=null;void openDeepLink(link).catch(()=>{});}
  if(smoke){
    const deadline=Date.now()+30000;let dom;
    do{dom=await win.webContents.executeJavaScript('({title:document.title,ready:document.querySelector("#connection")?.textContent,node:typeof require,apiReady:document.documentElement.dataset.ready==="true",folderValue:document.querySelector("#folder")?.value,urlInput:!!document.querySelector("#url"),folder:!!document.querySelector("#choose-folder"),queue:!!document.querySelector("#queue-start"),captions:!!document.querySelector("#with-subtitles"),merge:!!document.querySelector("#with-merge"),dubbing:!!document.querySelector("#with-dubbing"),calibration:!!document.querySelector("#calibrate-voice")})');if(dom.apiReady)break;await new Promise(r=>setTimeout(r,200));}while(Date.now()<deadline);
    const playback=await win.webContents.executeJavaScript(`(async()=>{const v=document.createElement('video');v.muted=true;v.src='/api/media?id=smoke-media';document.body.append(v);await v.play();await new Promise(r=>setTimeout(r,700));const audio=await fetch(v.src).then(r=>r.arrayBuffer());const context=new OfflineAudioContext(1,48000,48000),buffer=await context.decodeAudioData(audio),samples=buffer.getChannelData(0);let peak=0;for(const s of samples)peak=Math.max(peak,Math.abs(s));const result={width:v.videoWidth,height:v.videoHeight,currentTime:v.currentTime,frames:v.getVideoPlaybackQuality().totalVideoFrames,decodedAudioFrames:buffer.length,peak};v.pause();v.remove();return result;})()`);
    if(playback.width!==256||playback.currentTime<=0||playback.frames<1||playback.peak<.001)throw Error('Falha de reprodução/áudio na janela: '+JSON.stringify(playback));
    const target=require('./deep-links.cjs').timeLink('export-smoke',.5);app.emit('second-instance',{},[process.execPath,target]);
    let deepLink;const linkDeadline=Date.now()+15000;do{deepLink=await win.webContents.executeJavaScript('({open:document.querySelector("#preview-dialog").open,title:document.querySelector("#preview-title").textContent,time:document.querySelector("#player").currentTime})');if(deepLink.open&&deepLink.time>=.5)break;await new Promise(r=>setTimeout(r,50));}while(Date.now()<linkDeadline);
    await win.webContents.executeJavaScript('document.querySelector("#player").pause()');if(!deepLink.open||!deepLink.title.includes('Teste de link')||deepLink.time<.5||deepLink.time>1.2)throw Error('O link do PDF não abriu no tempo correto.');
    const summary=backend.state.exports.find(e=>e.id==='export-smoke');await require('../summary-document.cjs').exportSummaryDocuments(summary,{renderPdf:require('./summary-pdf.cjs').renderPdf});const pdf=fs.readFileSync(summary.topicSummary.pdf);if(!pdf.includes(Buffer.from(target))||!pdf.includes(Buffer.from('/Subtype /Link')))throw Error('O PDF não contém o link de navegação.');
    await win.webContents.executeJavaScript('document.querySelector("#preview-dialog").close()');
    backend.state.jobs=backend.state.jobs.filter(j=>j.id!=='smoke-media');
    const report={playback,deepLink,pdfLinks:true,version:app.getVersion(),packaged:app.isPackaged,electron:process.versions.electron,ownWindow:win instanceof BrowserWindow,storageOutsideInstall:!dataDir.startsWith(process.resourcesPath),...dom};
    if(dom.node!=='undefined'||!dom.apiReady||!dom.folderValue||!dom.queue||!dom.urlInput||!dom.dubbing||!dom.calibration)throw Error('A interface não ficou pronta: '+JSON.stringify(report));
    fs.writeFileSync(path.join(dataDir,'desktop-smoke.json'),JSON.stringify(report,null,2));
    fs.writeFileSync(path.join(dataDir,'desktop-smoke.png'),(await win.webContents.capturePage()).toPNG());
    await shutdown();
  }
}
if(acquired)app.whenReady().then(start).catch(e=>{try{fs.writeFileSync(path.join(app.getPath('userData'),'startup-error.txt'),e.stack);}catch{}if(!smoke)dialog.showErrorBox('Bili Studio',e.message);app.exit(1);});
app.on('before-quit',e=>{if(!quitting){e.preventDefault();shutdown();}});
app.on('window-all-closed',()=>{if(quitting)app.quit();});
