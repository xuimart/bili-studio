const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {downloadRanges}=require('../fast-download.cjs');
function responder(payload,events,fail=()=>false){return async(url,{headers})=>{const [start,end]=headers.Range.match(/\d+/g).map(Number),last=Math.min(end,payload.length-1);events.push({url,start,end:last});await new Promise(r=>setTimeout(r,2));if(fail(url,start))throw Error('CDN truncou o bloco');return new Response(payload.subarray(start,last+1),{status:206,headers:{'Content-Range':`bytes ${start}-${last}/${payload.length}`}});};}
test('download paralelo retoma prefixo e usa espelho sem alterar bytes',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bili-ranges-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'audio.m4a'),payload=Buffer.from(Array.from({length:10000},(_,i)=>i%251)),events=[];
 fs.writeFileSync(file+'.part',payload.subarray(0,1500));
 await downloadRanges(['primary','backup'],file,{chunkSize:1024,request:responder(payload,events,(url,start)=>url==='primary'&&start===2524)});
 assert.deepEqual(fs.readFileSync(file),payload);assert.ok(events.some(e=>e.url==='backup'));assert.ok(events.filter(e=>e.end>0).every(e=>e.start>=1500));assert.equal(fs.existsSync(file+'.part'),false);
});
test('falha preserva somente bytes contíguos e a retomada recupera o arquivo inteiro',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bili-ranges-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'video.mp4'),payload=Buffer.alloc(10000,87);
 await assert.rejects(downloadRanges(['primary'],file,{chunkSize:1024,request:responder(payload,[],(_,start)=>start===1024)}));
 const prefix=fs.statSync(file+'.part').size;assert.equal(prefix,1024);assert.deepEqual(fs.readFileSync(file+'.part'),payload.subarray(0,prefix));
 await downloadRanges(['primary'],file,{chunkSize:1024,request:responder(payload,[])});assert.deepEqual(fs.readFileSync(file),payload);
});
test('servidor que ignora Range não gera arquivo final inválido',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bili-ranges-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'bad.mp4');
 await assert.rejects(downloadRanges(['primary'],file,{request:async()=>new Response('bad',{status:200})}),/intervalo/);assert.equal(fs.existsSync(file),false);
});
