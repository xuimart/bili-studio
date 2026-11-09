const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
async function main(){
  const dir=path.resolve(process.argv[2]||'release'),p=require('../package.json');
  const asar=await import('@electron/asar'),file=path.join(dir,'win-unpacked','resources','app.asar');
  const files=asar.listPackage(file).map(n=>n.replaceAll('\\','/'));
  for(const name of ['/server.cjs','/desktop/main.cjs','/runtime-tools.cjs','/public/app.js'])assert.ok(files.includes(name),'Ausente: '+name);
  for(const name of files)assert.ok(!/^\/(?:data|downloads|bin)(?:\/|$)/.test(name)&&!/(?:^|\/)(?:cookies[^/]*|\.env|runtime\.json|state\.json|.*\.pfx)$/.test(name),'Dado privado no pacote: '+name);
  for(const name of files.filter(n=>!n.startsWith('/node_modules/')&&/\.(?:cjs|js|json)$/.test(n))){
    const text=asar.extractFile(file,name.slice(1)).toString();assert.ok(!/C:[\\/]+Users[\\/]+rafi_/i.test(text),'Caminho pessoal: '+name);assert.ok(!/gh[pousr]_[A-Za-z0-9]{24,}/.test(text),'Credencial no pacote: '+name);
  }
  assert.equal(JSON.parse(asar.extractFile(file,'package.json')).version,p.version);
  const installer='Bili-Studio-Setup-'+p.version+'-x64.exe',manifest=fs.readFileSync(path.join(dir,'latest.yml'),'utf8'),bytes=fs.readFileSync(path.join(dir,installer));
  assert.match(manifest,new RegExp('version: '+p.version.replaceAll('.','\\.')));assert.ok(manifest.includes(installer));
  assert.ok(manifest.includes(crypto.createHash('sha512').update(bytes).digest('base64')),'SHA-512 do manifesto divergente');
  assert.ok(fs.existsSync(path.join(dir,installer+'.blockmap')),'Blockmap ausente');
  const names=[installer,installer+'.blockmap','latest.yml'];
  fs.writeFileSync(path.join(dir,'SHA256SUMS.txt'),names.map(name=>crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,name))).digest('hex')+'  '+name).join('\n')+'\n');
  console.log(JSON.stringify({version:p.version,installer,bytes:bytes.length,files:files.length,privateDataAbsent:true,sha512Valid:true,sha256Created:true},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
