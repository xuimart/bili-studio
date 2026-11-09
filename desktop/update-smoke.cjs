// Test-only Electron entry point. Simulates an older installed version, downloads
// the real NSIS asset through electron-updater, and never installs or relaunches.
const {app}=require('electron'),{NsisUpdater}=require('electron-updater');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
app.setPath('userData',process.env.BILI_TEST_PROFILE);
app.whenReady().then(async()=>{
 const folder=path.resolve(process.env.BILI_TEST_RELEASE||'release'),version=require('../package.json').version,name='Bili-Studio-Setup-'+version+'-x64.exe';
 const bytes=fs.readFileSync(path.join(folder,name)),good=crypto.createHash('sha512').update(bytes).digest('base64'),results=[];
 const server=http.createServer((req,res)=>{
  const bad=req.url.startsWith('/bad/'),basename=decodeURIComponent(req.url.split('/').at(-1).split('?')[0]);
  if(basename==='latest.yml'){res.end('version: '+version+'\nfiles:\n  - url: '+name+'\n    sha512: '+(bad?Buffer.alloc(64,7).toString('base64'):good)+'\n    size: '+bytes.length+'\npath: '+name+'\nsha512: '+(bad?Buffer.alloc(64,7).toString('base64'):good)+'\nreleaseDate: 2026-11-09T00:00:00.000Z\n');return;}
  if(basename===name){res.writeHead(200,{'Content-Length':bytes.length,'Content-Type':'application/octet-stream'});res.end(bytes);return;}
  res.writeHead(404);res.end();
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  for(const bad of [false,true]){
   const config=path.join(app.getPath('userData'),bad?'bad.yml':'good.yml');fs.mkdirSync(path.dirname(config),{recursive:true});
   fs.writeFileSync(config,'provider: generic\nurl: http://127.0.0.1:'+server.address().port+(bad?'/bad/':'/good/')+'\nupdaterCacheDirName: bili-update-test-'+(bad?'bad':'good')+'\n');
   const updater=new NsisUpdater();updater.forceDevUpdateConfig=true;updater.updateConfigPath=config;updater.currentVersion=new(require(require.resolve('semver',{paths:[path.dirname(require.resolve('electron-updater'))]})).SemVer)('3.99.0');updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.disableDifferentialDownload=true;updater.verifyUpdateCodeSignature=false;updater.on('error',()=>{});updater.logger={info(){},warn(){},error(){},debug(){}};
   const checked=await updater.checkForUpdates();if(checked.updateInfo.version!==version)throw Error('Não encontrou a atualização de teste.');
   try{
    const files=await updater.downloadUpdate();if(bad)throw Error('Aceitou checksum incorreto.');
    if(crypto.createHash('sha512').update(fs.readFileSync(files[0])).digest('base64')!==good)throw Error('Arquivo baixado divergente.');
    results.push({test:'Consulta e download do instalador com SHA-512 válido',status:'passed',version,bytes:bytes.length});
   }catch(e){if(!bad||!/checksum|sha512/i.test(e.message))throw e;results.push({test:'Checksum incorreto é rejeitado',status:'passed'});}
  }
  fs.writeFileSync(path.join(app.getPath('userData'),'update-smoke.json'),JSON.stringify({scope:'Versão anterior simulada; instalação não executada por este teste.',results},null,2));
  console.log(JSON.stringify(results));server.close();app.exit(0);
 }catch(e){console.error(e.stack);server.close();app.exit(1);}
}).catch(e=>{console.error(e);app.exit(1);});
