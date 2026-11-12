const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApp}=require('../server.cjs'),{makeLibrary,safeName}=require('../library.cjs'),{ENGINE}=require('../dubbing-runtime.cjs');
test('reaproveitamento por aula é invalidado por legenda, vídeo, voz ou motor diferentes',t=>{
 const delivery=require('../lesson-delivery.cjs'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'bili-lesson-snapshot-'));t.after(()=>{const resolved=fs.realpathSync(dir);assert.ok(resolved.startsWith(fs.realpathSync(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('bili-lesson-snapshot-'));fs.rmSync(resolved,{recursive:true,force:true});});
 const output=path.join(dir,'a.mp4'),srt=path.join(dir,'a.srt'),vtt=path.join(dir,'a.vtt');fs.writeFileSync(output,'video');fs.writeFileSync(srt,'Observe as formas.');fs.writeFileSync(vtt,'WEBVTT');const p={subtitles:true,subtitleLanguage:'pt',language:'auto',dubbing:true,voice:'male'},item={output,status:'done',subtitles:{language:'pt',srt,vtt},dubbingStatus:'done',dubbing:{status:'done',engine:ENGINE,voice:'male',fingerprint:'test'}};item.processingDelivery=delivery.complete(item,p);
 assert.ok(delivery.reusable(item,p,ENGINE));assert.equal(delivery.reusable(item,{...p,voice:'female'},ENGINE),false);assert.equal(delivery.reusable(item,p,'outro motor'),false);
 fs.writeFileSync(srt,'Corrigimos a explicação das formas.');assert.equal(delivery.reusable(item,p,ENGINE),false);item.processingDelivery=delivery.complete(item,p);assert.ok(delivery.reusable(item,p,ENGINE));fs.writeFileSync(output,'outro vídeo maior');assert.equal(delivery.reusable(item,p,ENGINE),false);
});
async function until(check){const end=Date.now()+5000;while(!check()&&Date.now()<end)await new Promise(r=>setTimeout(r,10));assert.ok(check(),'A operação não atingiu o estado esperado.');}
async function fixture(t,hooks={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bili-lessons-')),steps=[];
 const library=makeLibrary({bvid:'BV17GsezzEyi',title:'Aulas de teste',pages:[1,2].map(p=>({page:p,part:'Aula '+p,duration:2}))},'https://www.bilibili.com/video/BV17GsezzEyi/');
 const target=path.join(dir,safeName(library.title,40)+' ['+safeName(library.id)+']');fs.mkdirSync(target,{recursive:true});
 const app=createApp({dataDir:path.join(dir,'profile'),token:'lesson-token',inspectMedia:async()=>({audioVerified:true,audioSignal:true}),
 transcribeMedia:async(item,_language,{signal})=>{steps.push('caption:'+item.index);await hooks.caption?.(item,signal);signal.throwIfAborted();const srt=path.join(dir,item.id.replaceAll(':','_')+'.original.srt');fs.writeFileSync(srt,'1\n00:00:00,000 --> 00:00:02,000\nObserve the shapes.\n');return{id:item.id,language:'en',srt,detectionVersion:2};},
 translateCaptions:async(original)=>{steps.push('translate:'+original.id);const srt=original.srt+'.pt.srt',vtt=original.srt+'.pt.vtt';fs.writeFileSync(srt,'1\n00:00:00,000 --> 00:00:02,000\nObserve as formas.\n');fs.writeFileSync(vtt,'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nObserve as formas.\n');return{language:'pt',sourceLanguage:'en',srt,vtt,original,createdAt:new Date().toISOString()};},
 dubMedia:async(item,{signal,voice,update})=>{steps.push('dub:'+item.index);await hooks.dub?.(item,signal);signal.throwIfAborted();update({progress:100});return{status:'done',engine:ENGINE,voice,fingerprint:'dub-'+item.id,media:{audioVerified:true,audioSignal:true}};},
 mergeMedia:async(items)=>{steps.push('merge');const output=path.join(target,'Aula completa.mp4');fs.writeFileSync(output,'merged fixture');return{id:'merged-lesson',index:99,type:'merged',status:'done',title:'Aula completa',sourceIds:items.map(i=>i.id),output,media:{audioVerified:true},duration:4};}});
 app.state.library=library;app.state.folder=dir;app.state.jobs=library.entries.map(e=>{const output=path.join(target,'Aula-'+e.index+'.mp4');fs.writeFileSync(output,'video '+e.index);return{...e,target,status:'done',output,media:{audioVerified:true,audioSignal:true}};});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.server.address().port;
 const request=(route,body,extra={})=>fetch(origin+route,{method:body===undefined?'GET':'POST',headers:{Origin:origin,Cookie:'bilibili_session=lesson-token',...(body===undefined?{}:{'Content-Type':'application/json'}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
 t.after(async()=>{if(app.state.operation?.status==='running'){await request('/api/cancel-operation',{});await until(()=>app.state.operation.status!=='running');}await app.pause();app.persist(true);await new Promise(r=>app.server.close(r));const resolved=fs.realpathSync(dir);assert.ok(resolved.startsWith(fs.realpathSync(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('bili-lessons-'));fs.rmSync(resolved,{recursive:true,force:true});});
 const start=(merge=false)=>request('/api/start',{ids:library.entries.map(e=>e.id),processing:{merge,subtitles:true,dubbing:true,voice:'male',language:'en',subtitleLanguage:'pt',summary:false}});
 return{app,request,steps,start};
}
test('aula separada conclui legenda e voz antes da próxima; streaming continua durante processamento',async t=>{
 let release,entered=false;const f=await fixture(t,{caption:async(item,signal)=>{if(item.index===2){entered=true;await new Promise((resolve,reject)=>{release=resolve;signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});}}});
 assert.equal((await f.start()).status,200);await until(()=>entered);const state=await(await f.request('/api/state')).json(),[a,b]=state.jobs;
 assert.equal(a.playbackReady,true);assert.equal(a.playbackLabel,'Assistir dublado');assert.equal(a.processingDelivery.status,'done');assert.equal(b.playbackReady,false);assert.equal(state.operation.status,'running');assert.equal(state.operation.completed,1);assert.deepEqual(f.steps.filter(s=>/caption|dub/.test(s)),['caption:1','dub:1','caption:2']);
 const video=await f.request('/api/media?id='+encodeURIComponent(a.id),undefined,{Range:'bytes=0-3'});assert.equal(video.status,206);assert.equal(await video.text(),'vide');assert.equal((await f.request('/api/subtitle?id='+encodeURIComponent(a.id)+'&format=vtt')).status,200);assert.equal((await f.request('/api/media?id='+encodeURIComponent(b.id))).status,409);assert.equal(f.app.state.operation.status,'running');
 release();await until(()=>f.app.state.workflow.status==='done');assert.deepEqual(f.steps.filter(s=>/caption|dub/.test(s)),['caption:1','dub:1','caption:2','dub:2']);assert.equal(f.app.state.exports.length,0);
});
test('falha na segunda aula conserva a primeira pronta e a retomada não a dubla de novo',async t=>{
 let fail=true;const f=await fixture(t,{dub:async item=>{if(item.index===2&&fail)throw Error('Falha de voz de teste');}});await f.start();await until(()=>f.app.state.operation?.status==='error');
 const [a,b]=f.app.state.jobs;assert.equal(a.processingDelivery.status,'done');assert.equal(b.processingDelivery.status,'error');const available=await f.request('/api/media?id='+encodeURIComponent(a.id));assert.equal(available.status,200);await available.arrayBuffer();assert.equal(b.subtitleDelivery.status,'done');
 fail=false;await f.start();await until(()=>f.app.state.workflow.status==='done');assert.equal(f.steps.filter(s=>s==='dub:1').length,1);assert.equal(f.steps.filter(s=>s==='caption:1').length,1);assert.equal(f.steps.filter(s=>s==='dub:2').length,2);assert.equal(b.processingDelivery.status,'done');
});
test('cancelamento mantém a primeira aula pronta para assistir',async t=>{
 let waiting=false;const f=await fixture(t,{caption:async(item,signal)=>{if(item.index===2){waiting=true;await new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}}});await f.start();await until(()=>waiting);await f.request('/api/cancel-operation',{});await until(()=>f.app.state.operation.status==='cancelled');
 assert.equal(f.app.state.jobs[0].processingDelivery.status,'done');assert.equal(f.app.state.jobs[1].processingDelivery.status,'paused');const state=await(await f.request('/api/state')).json();assert.equal(state.jobs[0].playbackReady,true);assert.equal(state.jobs[1].subtitleReady,false);
});
test('modo aula completa une primeiro e legenda e dubla somente o resultado',async t=>{
 const f=await fixture(t);await f.start(true);await until(()=>f.app.state.workflow.status==='done');assert.deepEqual(f.steps.filter(s=>s==='merge'||/caption|dub/.test(s)),['merge','caption:99','dub:99']);assert.equal(f.app.state.exports.length,1);assert.ok(f.app.state.jobs.every(j=>!j.dubbing));const state=await(await f.request('/api/state')).json();assert.equal(state.exports[0].playbackLabel,'Assistir dublado');
});
