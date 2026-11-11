const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const media = require('../media.cjs');
const ffmpeg = path.resolve(__dirname, '../bin/ffmpeg.exe');

test('faixa padrão é preservada quando a primeira faixa está silenciosa', {skip:!fs.existsSync(ffmpeg)},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bili-default-audio-'));t.after(()=>{const real=fs.realpathSync(dir);assert.ok(real.startsWith(fs.realpathSync(os.tmpdir())+path.sep));assert.match(path.basename(real),/^bili-default-audio-/);fs.rmSync(real,{recursive:true,force:true});});
 for(const ext of ['mkv','mp4']){
 const file=path.join(dir,'multi-'+ext+'.'+ext);await media.execute(ffmpeg,['-v','error','-f','lavfi','-i','color=size=128x72:rate=24','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-f','lavfi','-i','sine=frequency=880:sample_rate=48000','-t','1','-map','0:v','-map','1:a','-map','2:a','-c:v','libx264','-c:a','aac','-disposition:a:0','0','-disposition:a:1','default',file]);
 const before=await media.probe(file);assert.equal(before.audioCount,2);assert.equal(before.audio.disposition.default,1);assert.equal((await media.inspect(file)).audioSignal,true);
 const output=await media.finalizeDownload(file),after=await media.probe(output);assert.equal(after.audioCount,1);assert.equal((await media.inspect(output)).audioSignal,true);
 }
});
test('ranges de vídeo respeitam início, fim, sufixo e limites', () => {
  assert.deepEqual(media.parseRange('bytes=2-5', 10), { start: 2, end: 5 });
  assert.deepEqual(media.parseRange('bytes=-3', 10), { start: 7, end: 9 });
  assert.deepEqual(media.parseRange('bytes=5-', 10), { start: 5, end: 9 });
  for (const header of ['bytes=12-', 'bytes=9-3', 'bytes=0-1,3-4', 'bytes=-0']) assert.throws(() => media.parseRange(header, 10));
});
test('união de originais com várias faixas e resoluções diferentes mantém áudio padrão', {skip:!fs.existsSync(ffmpeg)},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bili-multi-merge-'));t.after(()=>{const real=fs.realpathSync(dir);assert.ok(real.startsWith(fs.realpathSync(os.tmpdir())+path.sep));assert.match(path.basename(real),/^bili-multi-merge-/);fs.rmSync(real,{recursive:true,force:true});});
 const a=path.join(dir,'a.mkv'),b=path.join(dir,'b.mp4');await media.execute(ffmpeg,['-v','error','-f','lavfi','-i','color=size=128x72:rate=24','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-f','lavfi','-i','sine=frequency=880:sample_rate=48000','-t','1','-map','0:v','-map','1:a','-map','2:a','-c:v','libx264','-c:a','aac','-disposition:a:0','0','-disposition:a:1','default',a]);
 await media.execute(ffmpeg,['-v','error','-f','lavfi','-i','color=size=256x144:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','1','-c:v','libx264','-c:a','aac',b]);
 const result=await media.merge([a,b].map((output,i)=>({id:String(i),index:i+1,title:'Aula',output})),'Várias faixas');assert.equal(result.media.audioSignal,true);assert.ok(Math.abs(result.duration-2)<.2);
});
test('concat e capítulos escapam nomes e preservam a ordem e os tempos', () => {
  assert.equal(media.concatLine("C:\\Vídeos\\Aula d'arte.mp4"), "file 'C:/Vídeos/Aula d'\\''arte.mp4'");
  const text = media.chapterMetadata([{ title: 'A=1', duration: 1.25 }, { title: 'B;#', duration: 2 }]);
  assert.match(text, /START=1250\nEND=3250/); assert.match(text, /title=A\\=1/);
});
test('junção real normaliza formatos diferentes e conserva vídeo, áudio e duração', { skip: !fs.existsSync(ffmpeg) }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bili-media-test-'));
  t.after(() => { const target = fs.realpathSync(dir); assert.ok(target.startsWith(fs.realpathSync(os.tmpdir()) + path.sep)); assert.ok(path.basename(target).startsWith('bili-media-test-')); fs.rmSync(target, { recursive: true, force: true }); });
  const files = [path.join(dir, 'a.mp4'), path.join(dir, 'b.mp4')];
  for (let i = 0; i < files.length; i++) await media.execute(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=' + (i ? 'blue' : 'red') + ':s=' + (i ? '640x360' : '320x180') + ':r=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '1.2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ac', '2', files[i]]);
  const result = await media.merge(files.map((output, i) => ({ id: String(i), index: i + 1, title: 'Parte ' + i, output })), 'Teste');
  assert.equal(result.media.audioVerified, true); assert.equal(result.media.audioSignal, true); assert.ok(Math.abs(result.duration - 2.4) < .2); assert.equal(result.media.width, 640);
  const probe = await media.execute(path.resolve(__dirname, '../bin/ffprobe.exe'), ['-v', 'error', '-show_chapters', '-of', 'json', result.output]);
  assert.equal(JSON.parse(probe.stdout).chapters.length, 2);
  const inputs=files.map((output,i)=>({id:String(i),index:i+1,output}));
  const cache=path.resolve(__dirname,'../data/work','merge-'+media.mergeKey(inputs));
  assert.equal(await media.reusablePart(path.join(cache,'part-0.mp4'),await media.probe(files[0]),640,360),true);
  assert.equal(await media.reusablePart(path.join(cache,'part-0.mp4'),{duration:100},640,360),false);
  fs.unlinkSync(result.output);
  const phases=[];const resumed=await media.merge(inputs,'Teste',{update:p=>phases.push(p.phase)});
  assert.equal(phases.filter(p=>p.startsWith('Reaproveitando')).length,2);assert.ok(fs.existsSync(resumed.output));
  const silent = path.join(dir, 'video-only.mp4');
  await media.execute(ffmpeg, ['-v','error','-i',files[0],'-an','-c:v','copy',silent]);
  await assert.rejects(media.inspect(silent), /sem faixa de áudio/);
});

test('união copia vídeo quando só o áudio difere e preserva frames e duração', {skip:!fs.existsSync(ffmpeg)}, async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bili-copy-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const files=[path.join(dir,'stereo.mp4'),path.join(dir,'mono.mp4')];
 for(let i=0;i<2;i++)await media.execute(ffmpeg,['-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=25','-f','lavfi','-i',`sine=frequency=440:sample_rate=${i?24000:48000}`,'-t','2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-ac',i?'1':'2',files[i]]);
 const phases=[];const result=await media.merge(files.map((output,i)=>({id:String(i),index:i+1,title:'Parte '+i,output})),'Teste',{update:p=>phases.push(p.phase)});
 assert.ok(phases.filter(p=>p.startsWith('Copiando vídeo sem reconverter')).length>=2);assert.ok(!phases.some(p=>p.startsWith('Padronizando vídeo')));assert.ok(Math.abs(result.duration-4)<.2);
 const frames=await media.execute(ffmpeg,['-v','error','-i',result.output,'-map','0:v:0','-f','framemd5','-']);const source=await media.execute(ffmpeg,['-v','error','-i',files[0],'-map','0:v:0','-f','framemd5','-']);
 const hashes=s=>s.split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>l.split(',').at(-1).trim());assert.deepEqual(hashes(frames.stdout).slice(0,50),hashes(source.stdout));assert.equal(hashes(frames.stdout).length,100);
});

test('conversão não reaproveita MP4 de duração errada e preserva o arquivo anterior', {skip:!fs.existsSync(ffmpeg)}, async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bili-finalize-test-'));
 t.after(()=>{const resolved=fs.realpathSync(dir);assert.ok(resolved.startsWith(fs.realpathSync(os.tmpdir())+path.sep));assert.ok(path.basename(resolved).startsWith('bili-finalize-test-'));fs.rmSync(resolved,{recursive:true,force:true});});
 const output=path.join(dir,'episodio.mp4'),source=path.join(dir,'episodio.mkv');
 for(const [file,duration]of [[output,'1'],[source,'2.5']])await media.execute(ffmpeg,['-v','error','-f','lavfi','-i','color=size=256x144:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t',duration,'-c:v','libx264','-c:a','aac','-y',file]);
 const original=fs.readFileSync(output),result=await media.finalizeDownload(source);
 assert.equal(result,output);assert.ok(Math.abs((await media.probe(output)).duration-2.5)<.15);
 const backup=fs.readdirSync(dir).find(n=>n.startsWith('episodio.mp4.anterior-'));assert.ok(backup);assert.ok(fs.readFileSync(path.join(dir,backup)).equals(original));
});

test('saída UTF-8 dividida entre buffers mantém títulos chineses e acentos',async()=>{
 const script="const b=Buffer.from('你好 · proporção');process.stdout.write(b.subarray(0,2));setTimeout(()=>{process.stdout.write(b.subarray(2));},20);";
 const result=await media.execute(process.execPath,['-e',script]);assert.equal(result.stdout,'你好 · proporção');
});
