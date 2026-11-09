const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {loadState,createStateStore}=require('../state-store.cjs');
test('bloqueio EPERM no destino não derruba o processo e recupera snapshot temporário',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bili-state-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'state.json');fs.writeFileSync(file,JSON.stringify({progress:60}));fs.utimesSync(file,new Date(0),new Date(0));
 let blocked=true,warnings=[];const io={...fs,renameSync:(a,b)=>{if(blocked)throw Object.assign(new Error('locked'),{code:'EPERM'});return fs.renameSync(a,b);}};const state={progress:70};const store=createStateStore(file,()=>state,{io,retryMs:20,onWarning:m=>warnings.push(m)});t.after(()=>store.close());
 assert.doesNotThrow(()=>store.persist(true));assert.equal(loadState(file).progress,70);assert.match(warnings[0],/EPERM/);state.progress=80;blocked=false;await new Promise(r=>setTimeout(r,50));assert.equal(JSON.parse(fs.readFileSync(file)).progress,80);assert.equal(warnings.at(-1),null);
 fs.writeFileSync(file+'.tmp','incomplete JSON');assert.equal(loadState(file).progress,80);
});
