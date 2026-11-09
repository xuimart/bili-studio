// Actual generated media, decoded and inspected by the same pipeline as downloads.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const media=require('../media.cjs'),{BIN_DIR,DATA_DIR}=require('../runtime-paths.cjs');
const ffmpeg=path.join(BIN_DIR,'ffmpeg.exe'),work=path.join(DATA_DIR,'format-matrix-'+Date.now());fs.mkdirSync(work,{recursive:true});
const cases=[
 {name:'MP4 H.264 + AAC estéreo',ext:'mp4',v:['-c:v','libx264'],a:['-c:a','aac','-ac','2']},
 {name:'MP4 fragmentado DASH H.264 + AAC mono',ext:'mp4',v:['-c:v','libx264'],a:['-c:a','aac','-ac','1'],extra:['-movflags','+frag_keyframe+empty_moov']},
 {name:'MP4 HEVC 8 bits + AAC',ext:'mp4',v:['-c:v','libx265','-x265-params','log-level=error'],a:['-c:a','aac']},
 {name:'MKV HEVC 10 bits + FLAC',ext:'mkv',v:['-c:v','libx265','-pix_fmt','yuv420p10le','-x265-params','log-level=error'],a:['-c:a','flac']},
 {name:'MP4 AV1 + AAC',ext:'mp4',v:['-c:v','libaom-av1','-cpu-used','8','-crf','45'],a:['-c:a','aac']},
 {name:'WebM VP9 + Opus',ext:'webm',v:['-c:v','libvpx-vp9','-deadline','realtime','-cpu-used','8'],a:['-c:a','libopus']},
 {name:'WebM VP8 + Vorbis',ext:'webm',v:['-c:v','libvpx','-deadline','realtime','-cpu-used','8'],a:['-c:a','libvorbis']},
 {name:'FLV H.264 + AAC',ext:'flv',v:['-c:v','libx264'],a:['-c:a','aac']},
 {name:'FLV legado FLV1 + MP3',ext:'flv',v:['-c:v','flv'],a:['-c:a','libmp3lame','-ar','44100']},
 {name:'MPEG-TS H.264 + AC3',ext:'ts',v:['-c:v','libx264'],a:['-c:a','ac3']},
 {name:'MKV H.264 + E-AC3 5.1',ext:'mkv',v:['-c:v','libx264'],a:['-c:a','eac3','-ac','6']},
 {name:'MP4 H.264 + ALAC',ext:'mp4',v:['-c:v','libx264'],a:['-c:a','alac']},
 {name:'HDR10 HEVC PQ para SDR H.264',ext:'mkv',v:['-c:v','libx265','-pix_fmt','yuv420p10le','-color_primaries','bt2020','-color_trc','smpte2084','-colorspace','bt2020nc','-x265-params','log-level=error'],a:['-c:a','aac']},
 {name:'HLG HEVC para SDR H.264',ext:'mkv',v:['-c:v','libx265','-pix_fmt','yuv420p10le','-color_primaries','bt2020','-color_trc','arib-std-b67','-colorspace','bt2020nc','-x265-params','log-level=error'],a:['-c:a','aac']},
 {name:'HLS segmentos TS H.264 + AAC',ext:'m3u8',v:['-c:v','libx264','-g','12'],a:['-c:a','aac'],extra:['-f','hls','-hls_time','0.5','-hls_list_size','0']},
 {name:'DASH segmentos fMP4 H.264 + AAC',ext:'mpd',v:['-c:v','libx264','-g','12'],a:['-c:a','aac'],extra:['-f','dash','-seg_duration','0.5']}
];
async function main(){
 const results=[],finals=[];
 for(let i=0;i<cases.length;i++){
  const c=cases[i],file=path.join(work,'case-'+i+'.'+c.ext),start=Date.now();
  try{
   await media.execute(ffmpeg,['-v','error','-f','lavfi','-i','testsrc2=size=256x144:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','1.25',...c.v,...c.a,...(c.extra||[]),'-y',file],{cwd:work});
   const before=await media.probe(file),output=await media.finalizeDownload(file),after=await media.probe(output),checked=await media.inspect(output);
   assert.equal(after.video.codec_name,'h264');assert.equal(after.audio.codec_name,'aac');assert.equal(checked.audioSignal,true);assert.ok(Math.abs(after.duration-1.25)<.15);
   await media.execute(ffmpeg,['-v','error','-i',output,'-f','null','NUL']);
   const frames=await media.execute(ffmpeg,['-v','error','-i',output,'-map','0:v:0','-f','framemd5','-']);
   const count=frames.stdout.split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).length;assert.ok(count>=29&&count<=31,'Quantidade de quadros divergente: '+count);
   if(before.video.codec_name==='h264')assert.equal(after.video.width,before.video.width);
   finals.push(output);results.push({name:c.name,status:'passed',video:after.video.codec_name,audio:after.audio.codec_name,frames:count,duration:after.duration,milliseconds:Date.now()-start});
   console.log('PASS '+c.name);
  }catch(e){results.push({name:c.name,status:'failed',error:e.message});console.error('FAIL '+c.name+' · '+e.message);}
 }
 if(finals.length){
  try{const union=await media.merge(finals.map((output,i)=>({id:'matrix-'+i,index:i+1,title:results[i].name,output})),'Matriz de compatibilidade');assert.equal(union.media.audioSignal,true);await media.execute(ffmpeg,['-v','error','-i',union.output,'-f','null','NUL']);results.push({name:'União de todos os formatos convertidos',status:'passed',duration:union.duration,episodes:finals.length});}catch(e){results.push({name:'União de todos os formatos convertidos',status:'failed',error:e.message});}
 }
 const videoOnly=path.join(work,'video-only.mp4');await media.execute(ffmpeg,['-v','error','-f','lavfi','-i','color=size=256x144:rate=24','-t','1','-c:v','libx264','-y',videoOnly]);await assert.rejects(media.finalizeDownload(videoOnly),/vídeo e áudio/);
 const audioOnly=path.join(work,'audio-only.m4a');await media.execute(ffmpeg,['-v','error','-f','lavfi','-i','sine=frequency=440','-t','1','-c:a','aac','-y',audioOnly]);await assert.rejects(media.finalizeDownload(audioOnly),/vídeo e áudio/);
 results.push({name:'Rejeição explícita de vídeo sem áudio e áudio sem vídeo',status:'passed'});
 const report={createdAt:new Date().toISOString(),scope:'Amostras sintéticas reais; não garante todo conteúdo ou disponibilidade do Bilibili.',results,failed:results.filter(r=>r.status==='failed').length};
 fs.writeFileSync(path.join(DATA_DIR,'format-matrix-report.json'),JSON.stringify(report,null,2));if(report.failed)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
