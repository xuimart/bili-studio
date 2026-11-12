const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {BIN_DIR}=require('../runtime-paths.cjs'),media=require('../media.cjs'),{dub}=require('../dubbing.cjs');
test('troca real de áudio conserva a imagem e o original; falha de voz não altera o MP4',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bili-dub-media-'));t.after(()=>{const real=fs.realpathSync(dir);assert.ok(real.startsWith(fs.realpathSync(os.tmpdir())+path.sep)&&path.basename(real).startsWith('bili-dub-media-'));fs.rmSync(real,{recursive:true,force:true});});
 const ff=path.join(BIN_DIR,'ffmpeg.exe'),output=path.join(dir,'Aula.mp4'),audio=path.join(dir,'voice.wav'),srt=path.join(dir,'Aula.srt');
 await media.execute(ff,['-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=24','-f','lavfi','-i','sine=frequency=880:sample_rate=24000','-t','2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-y',output]);await media.execute(ff,['-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=24000','-t','2','-ac','1','-y',audio]);fs.writeFileSync(srt,'1\n00:00:00,000 --> 00:00:02,000\nVamos observar as formas.\n');
 const item={id:'media-test',output,libraryRoot:dir,subtitles:{language:'pt',srt}},before=fs.readFileSync(output),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
 await assert.rejects(dub(item,{detectPauses:async()=>[],worker:async()=>{throw Error('motor de teste indisponível');}}),/indisponível/);assert.equal(hash(fs.readFileSync(output)),hash(before));
 const framesBefore=(await media.execute(ff,['-v','error','-i',output,'-map','0:v:0','-f','framemd5','-'])).stdout;
 const result=await dub(item,{detectPauses:async()=>[],worker:async plan=>{assert.equal(plan.segments[0].start,0);assert.equal(plan.segments[0].end,2);return{audio,hardware:'fixture',synthesisSeconds:.1,speechSeconds:2};}});
 assert.equal(hash(fs.readFileSync(result.originalVideo)),hash(before));const info=await media.probe(output);assert.equal(info.audioCount,1);assert.equal(info.audio.tags.language,'por');assert.ok(Math.abs(info.duration-2)<.1);assert.equal(result.videoCopied,true);
 const framesAfter=(await media.execute(ff,['-v','error','-i',output,'-map','0:v:0','-f','framemd5','-'])).stdout;assert.equal(framesAfter,framesBefore);assert.equal(fs.readFileSync(srt,'utf8').includes('Vamos observar'),true);
});
