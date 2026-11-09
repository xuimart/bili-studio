const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const http = require('node:http');
const { createApp, buildArgs } = require('../server.cjs');
const { makeLibrary } = require('../library.cjs');
const library = makeLibrary({ bvid: 'BV17GsezzEyi', title: 'Biblioteca de teste', pages: [1, 2, 3].map(p => ({ page: p, part: 'Parte ' + p, duration: 10 })) }, 'https://www.bilibili.com/video/BV17GsezzEyi/');
async function fixture(t, extra = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bili-test-'));
  const app = createApp({ dataDir, token: 'test-token', discover: async () => library, inspectMedia: async () => ({ audioVerified: true, audioSignal: true }), ...extra });
  app.state.folder = path.join(dataDir, 'videos');
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + app.server.address().port;
  const request = (route, body, headers = {}) => fetch(origin + route, { method: body === undefined ? 'GET' : 'POST', headers: { Cookie: 'bilibili_session=test-token', Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  t.after(async () => { await app.pause(); app.persist(true); await new Promise(resolve => app.server.close(resolve)); fs.rmSync(dataDir, { recursive: true, force: true }); });
  return { app, request, dataDir, origin };
}
async function idle(app) { const deadline = Date.now() + 3000; while (app.state.busy && Date.now() < deadline) await new Promise(r => setTimeout(r, 10)); assert.equal(app.state.busy, false); }
test('API local exige sessão e rejeita origem externa e DNS rebinding', async t => {
  const { request, origin } = await fixture(t);
  assert.equal((await fetch(origin + '/api/state')).status, 401);
  assert.equal((await request('/api/discover', { url: library.source }, { Origin: 'https://evil.test' })).status, 403);
  const reboundStatus = await new Promise((resolve, reject) => {
    http.get(origin + '/api/state', { headers: { Host: 'evil.test', Cookie: 'bilibili_session=test-token' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(reboundStatus, 403);
  assert.equal((await request('/api/state')).status, 200);
  const html = await request('/'); assert.equal(html.status, 200); assert.match(html.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});
test('fila continua após erro, verifica arquivo final, e repetição pula concluídos', async t => {
  let calls = 0, failedOnce = false;
  const { app, request } = await fixture(t, { spawnDownload: args => {
    calls++;
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    const p2 = args.at(-1).endsWith('p=2');
    const fail = p2 && !failedOnce; if (fail) failedOnce = true;
    setTimeout(() => {
      if (fail) child.stderr.write('ERROR: HTTP Error 412\n');
      else {
        const output = path.join(args.find(a => a.startsWith('home:')).slice(5), args[args.indexOf('-o') + 1].replaceAll('%%', '%').replace('.%(ext)s', '.mp4'));
        fs.writeFileSync(output, 'fake-mp4');
        child.stdout.write('@@PROGRESS@@{"downloaded":50,"total":100,"speed":42,"eta":1}\n');
        child.stdout.write('@@FILE@@' + JSON.stringify(output) + '\n');
      }
      setTimeout(() => { child.stdout.end(); child.stderr.end(); child.emit('close', fail ? 1 : 0); }, 10);
    }, 10);
    return child;
  } });
  assert.equal((await request('/api/discover', { url: library.source })).status, 200);
  const ids = library.entries.map(e => e.id);
  const body = { ids, folder: app.state.folder, quality: '720' };
  assert.equal((await request('/api/start', body)).status, 200); await idle(app);
  assert.deepEqual(app.state.jobs.map(j => j.status), ['done', 'error', 'done']); assert.equal(calls, 3);
  assert.equal((await request('/api/start', body)).status, 200); await idle(app);
  assert.deepEqual(app.state.jobs.map(j => j.status), ['done', 'done', 'done']); assert.equal(calls, 4);
  fs.unlinkSync(app.state.jobs[0].output);
  await request('/api/start', { ...body, ids: [ids[0]] }); await idle(app);
  assert.equal(calls, 5); assert.equal(app.state.jobs[0].status, 'done');
});
test('reiniciar a aplicação deixa transferências pendentes pausadas', async t => {
  const { dataDir } = await fixture(t);
  fs.writeFileSync(path.join(dataDir, 'state.json'), JSON.stringify({ jobs: [{ status: 'downloading' }, { status: 'queued' }, { status: 'merging' }, { status: 'done' }] }));
  const other = createApp({ dataDir });
  assert.deepEqual(other.state.jobs.map(j => j.status), ['paused', 'paused', 'paused', 'done']);
});
test('argumentos não invocam shell, limitam resolução e mantêm áudio no MP4', () => {
  const args = buildArgs({ ...library.entries[0], title: '100% / exemplo' }, { target: 'C:\\Videos', quality: '720', cookieFile: '', ffmpeg: 'C:\\Tools' });
  assert.match(args[args.indexOf('-f') + 1], /height<=720/); assert.match(args[args.indexOf('-f') + 1], /\+ba/);
  assert.match(args[args.indexOf('-o') + 1], /100%%/); assert.equal(args.at(-2), '--');
  assert.ok(args.includes('--continue')); assert.ok(args.includes('--no-playlist')); assert.ok(args.includes('--ignore-config'));
  assert.ok(args.some(a => a.startsWith('temp:') && a.endsWith('.em-andamento')));
  assert.equal(path.isAbsolute(args[args.indexOf('-o') + 1]), false);
});
test('player só expõe arquivos finais verificados e suporta reprodução parcial', async t => {
  const { app, request, dataDir } = await fixture(t);
  const file = path.join(dataDir, 'video.mp4'); fs.writeFileSync(file, '0123456789');
  app.state.jobs = [{ ...library.entries[0], status: 'done', output: file, media: { audioVerified: true } }, { ...library.entries[1], status: 'downloading', output: file }];
  const res = await request('/api/media?id=' + encodeURIComponent(library.entries[0].id), undefined, { Range: 'bytes=2-5' });
  assert.equal(res.status, 206); assert.equal(res.headers.get('content-range'), 'bytes 2-5/10'); assert.equal(await res.text(), '2345');
  assert.equal((await request('/api/media?id=' + encodeURIComponent(library.entries[1].id))).status, 404);
  app.state.jobs[0].media.audioVerified = false;
  assert.equal((await request('/api/media?id=' + encodeURIComponent(library.entries[0].id))).status, 409);
});
test('exportação não aceita itens incompletos ou seleção duplicada', async t => {
  const { app, request, dataDir } = await fixture(t); const file = path.join(dataDir, 'video.mp4'); fs.writeFileSync(file, 'fake');
  app.state.jobs = [{ ...library.entries[0], status: 'done', output: file }];
  assert.equal((await request('/api/merge', { ids: [library.entries[0].id, library.entries[1].id] })).status, 400);
  assert.equal((await request('/api/merge', { ids: [library.entries[0].id, library.entries[0].id] })).status, 400);
});

test('fluxo único baixa, junta na ordem e traduz somente o vídeo final quando ativado', async t => {
  const steps=[];
  const {app,request,dataDir}=await fixture(t,{
    spawnDownload:args=>{
      const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();
      setTimeout(()=>{const output=path.join(args.find(a=>a.startsWith('home:')).slice(5),args[args.indexOf('-o')+1].replace('.%(ext)s','.mp4'));fs.writeFileSync(output,'fake');steps.push('download');child.stdout.write('@@FILE@@'+JSON.stringify(output)+'\n');setTimeout(()=>child.emit('close',0),5);},5);return child;
    },
    mergeMedia:async items=>{steps.push('merge');assert.deepEqual(items.map(i=>i.index),[1,3]);return{id:'merged',sourceIds:items.map(i=>i.id),status:'done',output:path.join(dataDir,'merged.mp4')};},
    transcribeMedia:async(item,language)=>{steps.push('whisper');assert.equal(item.id,'merged');assert.equal(language,'en');return{language:'en',srt:'original'};},
    translateCaptions:async original=>{steps.push('translate');assert.equal(original.srt,'original');return{language:'pt',srt:'translated'};}
  });
  await request('/api/discover',{url:library.source});
  const res=await request('/api/start',{ids:[library.entries[2].id,library.entries[0].id],processing:{merge:true,subtitles:true,language:'en',subtitleLanguage:'pt'}});
  assert.equal(res.status,200);await idle(app);
  const deadline=Date.now()+1000;while(app.state.operation?.status==='running'&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));
  assert.deepEqual(steps,['download','download','merge','whisper','translate']);assert.equal(app.state.workflow.status,'done');assert.equal(app.state.exports[0].subtitles.language,'pt');assert.equal(app.state.jobs.length,2);
});

test('opções desligadas não processam; legendas individuais e falha de download respeitam seleção', async t=>{
  let merges=0;const captions=[];
  const {app,request,dataDir}=await fixture(t,{mergeMedia:async()=>{merges++;},transcribeMedia:async(item)=>{captions.push(item.index);return{language:'en'};},spawnDownload:()=>{const c=new EventEmitter();c.stdout=new PassThrough();c.stderr=new PassThrough();setTimeout(()=>{c.stderr.write('ERROR: teste\n');c.emit('close',1);},5);return c;}});
  app.state.library=library;const target=path.join(app.state.folder,'Biblioteca de teste [BV17GsezzEyi]');fs.mkdirSync(target,{recursive:true});
  app.state.jobs=library.entries.slice(0,2).map(e=>{const output=path.join(target,e.index+'.mp4');fs.writeFileSync(output,'fake');return{...e,target,output,status:'done'};});
  const ids=app.state.jobs.map(j=>j.id);
  await request('/api/start',{ids,processing:{merge:false,subtitles:false,language:'auto'}});await idle(app);assert.equal(app.state.workflow.status,'done');assert.equal(captions.length,0);assert.equal(merges,0);
  await request('/api/start',{ids,processing:{merge:false,subtitles:true,language:'en'}});await idle(app);await new Promise(r=>setTimeout(r,20));assert.deepEqual(captions,[1,2]);assert.equal(merges,0);
  await request('/api/start',{ids:library.entries.map(e=>e.id),processing:{merge:true,subtitles:true,language:'en'}});await idle(app);assert.equal(app.state.workflow.status,'blocked');assert.equal(merges,0);assert.deepEqual(captions,[1,2]);
});

test('seletor de destino lista somente pastas e rejeita caminhos inválidos',async t=>{
 const {request,dataDir}=await fixture(t);fs.mkdirSync(path.join(dataDir,'Meus vídeos'));fs.writeFileSync(path.join(dataDir,'privado.txt'),'not listed');
 const response=await request('/api/browse-folders',{path:dataDir});assert.equal(response.status,200);const data=await response.json();assert.equal(data.path,dataDir);assert.ok(data.directories.some(d=>d.name==='Meus vídeos'));assert.ok(!data.directories.some(d=>d.name==='privado.txt'));
 assert.equal((await request('/api/browse-folders',{path:'relative'})).status,400);assert.equal((await request('/api/browse-folders',{path:path.join(dataDir,'missing')})).status,400);
});

async function until(predicate) {
  const deadline=Date.now()+5000;
  while(!predicate() && Date.now()<deadline) await new Promise(r=>setTimeout(r,10));
  assert.ok(predicate(),'A condição não foi alcançada');
}
function fakeDownload(record=()=>{}) {
  return args=>{
    record(args);const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();
    setTimeout(()=>{const output=path.join(args.find(a=>a.startsWith('home:')).slice(5),args[args.indexOf('-o')+1].replace('.%(ext)s','.mp4'));fs.writeFileSync(output,'fake');child.stdout.write('@@FILE@@'+JSON.stringify(output)+'\n');setTimeout(()=>{child.stdout.end();child.stderr.end();child.emit('close',0);},5);},5);return child;
  };
}
const secondLibrary=makeLibrary({bvid:'BV1234567890',title:'Outra playlist',pages:[1,2].map(page=>({page,part:'Outra parte '+page,duration:10}))},'https://www.bilibili.com/video/BV1234567890/');

test('áudio interrompido tenta faixa alternativa e preserva a causa real do erro',async t=>{
 let calls=0;
 const {app,request}=await fixture(t,{spawnDownload:args=>{
  calls++;
  if(calls>1){assert.match(args[args.indexOf('-f')+1],/format_id!\^=30280/);return fakeDownload()(args);}
  const c=new EventEmitter();c.stdout=new PassThrough();c.stderr=new PassThrough();setTimeout(()=>{c.stdout.write('[download] Destination: episode.f30280.m4a\n');c.stderr.write('ERROR: \r[download] Got error: 546 bytes read, 1048576 more expected. Giving up after 3 retries\n');setTimeout(()=>c.emit('close',1),5);},5);return c;
 }});
 await request('/api/discover',{url:library.source});await request('/api/start',{ids:[library.entries[0].id]});await idle(app);
 assert.equal(calls,2);assert.equal(app.state.jobs[0].status,'done');assert.deepEqual(app.state.jobs[0].excludedAudioFormats,['30280']);assert.match(fs.readFileSync(app.state.jobs[0].downloadLog,'utf8'),/546 bytes read/);
});

test('falha do vídeo não exclui o áudio que terminou depois',async t=>{
 let calls=0;
 const {app,request}=await fixture(t,{spawnDownload:args=>{
  calls++;
  if(calls>1){assert.doesNotMatch(args[args.indexOf('-f')+1],/format_id/);return fakeDownload()(args);}
  const c=new EventEmitter();c.stdout=new PassThrough();c.stderr=new PassThrough();
  setTimeout(()=>{c.stdout.write('[info] Downloading 1 format(s): 30080+30280\n');c.stderr.write('ERROR: \r[download] Got error: 814580 bytes read, 1048576 more expected. Giving up after 3 retries\n');setTimeout(()=>{c.stdout.write('[download] Destination: episode.f30280.m4a\n');setTimeout(()=>c.emit('close',1),5);},5);},5);return c;
 }});
 await request('/api/discover',{url:library.source});await request('/api/start',{ids:[library.entries[0].id]});await idle(app);
 assert.equal(calls,2);assert.equal(app.state.jobs[0].status,'done');assert.deepEqual(app.state.jobs[0].excludedAudioFormats||[],[]);
});

test('fila salva seleções e opções por link, aceita novos links durante legenda e só então avança',async t=>{
  const steps=[];let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const {app,request,dataDir}=await fixture(t,{
    discover:async url=>url===secondLibrary.source?secondLibrary:library,
    spawnDownload:fakeDownload(args=>steps.push(args.at(-1))),
    mergeMedia:async(items,title)=>{steps.push('merge:'+title);const output=path.join(items[0].target,'merged.mp4');fs.writeFileSync(output,'fake');return{id:'export-'+items[0].id,title,status:'done',sourceIds:items.map(i=>i.id),output};},
    transcribeMedia:async()=>{steps.push('whisper');await gate;return{language:'en',srt:'original'};},
    translateCaptions:async()=>{steps.push('pt');return{language:'pt',srt:'translated'};}
  });
  await request('/api/discover',{url:library.source});
  const folderA=path.join(dataDir,'A'),folderB=path.join(dataDir,'B');
  assert.equal((await request('/api/queue/add',{ids:[library.entries[2].id,library.entries[0].id],folder:folderA,quality:'720',processing:{merge:true,subtitles:true,language:'en',subtitleLanguage:'pt'}})).status,200);
  assert.equal(app.state.busy,false);await request('/api/queue/start',{});await until(()=>steps.includes('whisper'));
  assert.equal((await request('/api/discover',{url:secondLibrary.source,folder:folderB})).status,200);
  assert.equal((await request('/api/queue/add',{urls:[secondLibrary.source],folder:folderB,quality:'480',processing:{merge:false,subtitles:false,language:'auto'}})).status,200);
  assert.equal(app.state.linkQueue[1].status,'pending');assert.equal(steps.length,4);
  release();await until(()=>app.state.linkQueue.every(q=>q.status==='done'));
  assert.deepEqual(steps,[library.entries[0].url,library.entries[2].url,'merge:Biblioteca de teste','whisper','pt',secondLibrary.entries[0].url,secondLibrary.entries[1].url]);
  assert.ok(app.state.linkQueue[0].target.startsWith(folderA));assert.ok(app.state.linkQueue[1].target.startsWith(folderB));
  assert.equal(app.state.jobs[0].quality,'720');assert.equal(app.state.jobs.at(-1).quality,'480');assert.equal(app.state.jobs.length,4);
  assert.equal(app.state.exports[0].subtitles.language,'pt');assert.ok(app.state.linkQueue[0].resultId);assert.equal(app.state.linkQueue[1].resultId,undefined);
  assert.equal(app.state.queueEnabled,false);
});

test('fila valida lote inteiro, segue após link com erro e permite tentar novamente',async t=>{
  let fail=true;
  const {app,request}=await fixture(t,{discover:async url=>{if(url===library.source&&fail)throw Error('Link indisponível');return url===library.source?library:secondLibrary;},spawnDownload:fakeDownload()});
  assert.equal((await request('/api/queue/add',{urls:[library.source,'https://evil.test/']})).status,400);assert.equal(app.state.linkQueue.length,0);
  await request('/api/queue/add',{urls:[library.source,secondLibrary.source]});await request('/api/queue/start',{});
  await until(()=>app.state.linkQueue[1].status==='done');assert.equal(app.state.linkQueue[0].status,'error');
  fail=false;await request('/api/queue/retry',{id:app.state.linkQueue[0].id});await request('/api/queue/start',{});await until(()=>app.state.linkQueue.every(q=>q.status==='done'));
  const file=app.state.jobs[0].output;await request('/api/queue/remove',{id:app.state.linkQueue[1].id});assert.ok(fs.existsSync(file));assert.equal(app.state.linkQueue.length,1);
});

test('pausar após o atual preserva próximos, e reinício restaura a fila sem iniciar sozinho',async t=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const {app,request,dataDir}=await fixture(t,{discover:async url=>url===library.source?library:secondLibrary,spawnDownload:fakeDownload(),transcribeMedia:async()=>{await gate;return{language:'en'};}});
  await request('/api/queue/add',{urls:[library.source],processing:{merge:false,subtitles:true,language:'en'}});
  await request('/api/queue/add',{urls:[secondLibrary.source]});await request('/api/queue/start',{});
  await until(()=>app.state.operation?.status==='running');assert.equal((await request('/api/queue/remove',{id:app.state.linkQueue[0].id})).status,400);
  await request('/api/queue/pause',{});release();await until(()=>app.state.linkQueue[0].status==='done');assert.equal(app.state.linkQueue[1].status,'pending');
  app.state.linkQueue[1].status='running';app.persist(true);
  const restored=createApp({dataDir});assert.equal(restored.state.linkQueue[1].status,'paused');assert.equal(restored.state.queueEnabled,false);assert.equal(restored.state.linkQueue[0].status,'done');restored.server.emit('close');
  app.state.linkQueue[1].status='paused';await request('/api/queue/start',{});await until(()=>app.state.linkQueue[1].status==='done');
  // Existing files make the download worker finish synchronously; the next cached item must still run.
  await request('/api/queue/add',{urls:[secondLibrary.source,library.source]});await request('/api/queue/start',{});await until(()=>app.state.linkQueue.every(q=>q.status==='done'));
});

test('desktop usa seletor nativo injetado e informa o modo à interface',async t=>{
 let selected;const {request}=await fixture(t,{choosePath:async type=>{selected=type;return 'C:\\Videos';}});
 const response=await request('/api/choose-folder',{});assert.equal(response.status,200);assert.equal((await response.json()).path,'C:\\Videos');assert.equal(selected,'folder');
 assert.equal((await(await request('/api/state')).json()).desktop,true);
});

test('tradução interrompida preserva fonte e não publica chinês como legenda PT',async t=>{
 const {app,request,dataDir}=await fixture(t,{transcribeMedia:async()=>({language:'zh',srt:path.join(dataDir,'source.srt')}),translateCaptions:async()=>{throw Error('JSON incompleto');}});
 const video=path.join(dataDir,'video.mp4');fs.writeFileSync(video,'video');fs.writeFileSync(path.join(dataDir,'source.srt'),'1\n00:00:00,000 --> 00:00:02,000\n你好\n');
 const item={id:'test-export',status:'done',output:video,media:{audioVerified:true},sourceIds:[]};app.state.exports.push(item);
 const response=await request('/api/subtitles',{ids:[item.id],language:'zh',subtitleLanguage:'pt'});assert.equal(response.status,200);
 const limit=Date.now()+2000;while(app.state.operation?.status==='running'&&Date.now()<limit)await new Promise(r=>setTimeout(r,10));
 assert.equal(app.state.operation.status,'error');assert.equal(item.subtitles,undefined);assert.equal(item.subtitleSource.language,'zh');
 const state=await(await request('/api/state')).json();assert.equal(state.exports[0].subtitleReady,false);assert.match(state.exports[0].subtitleNotice,/português falhou/);
 assert.equal((await request('/api/subtitle?id='+item.id+'&format=srt')).status,409);assert.equal((await request('/api/media?id='+item.id)).status,200);
});

test('nova solicitação PT reaproveita legenda portuguesa pronta sem transcrever novamente',async t=>{
 let calls=0;const {app,request,dataDir}=await fixture(t,{transcribeMedia:async()=>{calls++;throw Error('não deveria transcrever');},translateCaptions:async()=>{calls++;throw Error('não deveria traduzir');}});
 const video=path.join(dataDir,'video.mp4'),srt=path.join(dataDir,'portugues.srt'),vtt=path.join(dataDir,'portugues.vtt');fs.writeFileSync(video,'video');fs.writeFileSync(srt,'1\n00:00:00,000 --> 00:00:02,000\nOlá.\n');fs.writeFileSync(vtt,'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nOlá.\n');
 const item={id:'ready-export',status:'done',output:video,sourceIds:[],subtitles:{language:'pt',sourceLanguage:'zh',srt,vtt,original:{language:'zh',detectionVersion:2}}};app.state.exports.push(item);
 assert.equal((await request('/api/subtitles',{ids:[item.id],language:'auto',subtitleLanguage:'pt'})).status,200);const limit=Date.now()+1000;while(app.state.operation?.status==='running'&&Date.now()<limit)await new Promise(r=>setTimeout(r,10));assert.equal(calls,0);assert.equal(app.state.operation.status,'done');assert.match(await(await request('/api/subtitle?id='+item.id+'&format=srt')).text(),/Olá/);
});
