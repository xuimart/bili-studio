const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { ensureWhisper } = require('./whisper.cjs');
const {APP_ROOT:ROOT,DATA_DIR,BIN_DIR:BIN} = require('./runtime-paths.cjs');
const FFMPEG = path.join(BIN, 'ffmpeg.exe');
const FFPROBE = path.join(BIN, 'ffprobe.exe');
function execute(exe, args, { signal, onLine = () => {}, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'], signal, cwd });
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    let stdout = '', stderr = '', settled = false;
    child.stdout.on('data', d => { stdout = (stdout + d).slice(-4000000); });
    child.stderr.on('data', d => { stderr = (stderr + d).slice(-16000); });
    for (const input of [child.stdout, child.stderr]) readline.createInterface({ input }).on('line', onLine);
    function done(error) { if (settled) return; settled = true; error ? reject(error) : resolve({ stdout, stderr }); }
    child.on('error', done); child.on('close', code => done(code === 0 ? null : new Error(signal?.aborted ? 'Operação cancelada.' : stderr.trim().slice(-1800) || `Processamento terminou com código ${code}.`)));
  });
}
async function probe(file, signal) {
  const { stdout } = await execute(FFPROBE, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { signal });
  const data = JSON.parse(stdout); const video = data.streams.find(s => s.codec_type === 'video'), audio = data.streams.find(s => s.codec_type === 'audio');
  return { video, audio, duration: Number(data.format?.duration) || 0, size: Number(data.format?.size) || 0 };
}
async function inspect(file, { signal, volume = true } = {}) {
  const info = await probe(file, signal);
  if (!info.video) throw new Error('O arquivo não contém vídeo. Retome este episódio para baixar novamente.');
  if (!info.audio) throw new Error('O arquivo está sem faixa de áudio. Retome este episódio para baixar novamente.');
  if (!info.duration) throw new Error('O arquivo está incompleto ou não tem duração válida.');
  let peakDb = null, meanDb = null;
  if (volume) {
    const { stderr } = await execute(FFMPEG, ['-hide_banner', '-i', file, '-t', '30', '-map', '0:a:0', '-vn', '-af', 'volumedetect', '-f', 'null', 'NUL'], { signal });
    peakDb = Number(stderr.match(/max_volume:\s*([\d.-]+) dB/)?.[1]);
    meanDb = Number(stderr.match(/mean_volume:\s*([\d.-]+) dB/)?.[1]);
    if (!Number.isFinite(peakDb)) peakDb = null;
    if (!Number.isFinite(meanDb)) meanDb = null;
  }
  return { width: info.video.width, height: info.video.height, videoCodec: info.video.codec_name, audioCodec: info.audio.codec_name, channels: info.audio.channels, duration: info.duration, size: info.size, peakDb, meanDb, audioVerified: true, audioSignal: peakDb !== null && peakDb > -65, checkedAt: new Date().toISOString() };
}
async function thumbnail(file, key, signal) {
  const dir = path.join(DATA_DIR, 'thumbnails'); fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, crypto.createHash('sha256').update(key).digest('hex').slice(0, 24) + '.jpg');
  if (!fs.existsSync(target)) await execute(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-ss', '8', '-i', file, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '3', '-y', target], { signal });
  return fs.existsSync(target) ? target : null;
}
function playbackPlan(info) {
  if(!info.video || !info.audio)throw Error('O download precisa conter vídeo e áudio. Retome o episódio ou verifique o acesso no Bilibili.');
  const hdr=['smpte2084','arib-std-b67'].includes(info.video.color_transfer);
  const copyVideo=info.video.codec_name==='h264' && ['yuv420p','yuvj420p'].includes(info.video.pix_fmt) && !hdr;
  const copyAudio=info.audio.codec_name==='aac';
  return {copyVideo,copyAudio,hdr};
}
async function finalizeDownload(file,{signal,update=()=>{}}={}) {
  const info=await probe(file,signal),plan=playbackPlan(info);
  if(/\.mp4$/i.test(file)&&plan.copyVideo&&plan.copyAudio)return file;
  const output=file.replace(/\.[^.\\/]+$/,'')+'.mp4';
  const partial=output+'.preparando.mp4';
  const filter=plan.hdr?'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p':'scale=trunc(iw/2)*2:trunc(ih/2)*2';
  update({phase:plan.copyVideo&&plan.copyAudio?'Preparando MP4 sem reconverter':'Convertendo para MP4 compatível com áudio',progress:0});
  await execute(FFMPEG,['-v','error','-i',file,'-map','0:v:0','-map','0:a:0',...(plan.copyVideo?['-c:v','copy']:['-vf',filter,'-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p']),...(plan.copyAudio?['-c:a','copy']:['-c:a','aac','-b:a','192k']),'-map_metadata','0','-disposition:a:0','default','-movflags','+faststart','-progress','pipe:1','-nostats','-y',partial],{signal,onLine:ffProgress(info.duration,p=>update({progress:p}))});
  const verified=await inspect(partial,{signal});
  if(Math.abs(verified.duration-info.duration)>Math.max(1,info.duration*.005))throw Error('A duração mudou ao preparar o MP4. O download original foi preservado.');
  // Never overwrite an existing final file without validating it first.
  if(fs.existsSync(output)&&output!==file){
    let reusable=false;
    try{const previous=await probe(output,signal),oldPlan=playbackPlan(previous);reusable=oldPlan.copyVideo&&oldPlan.copyAudio&&Math.abs(previous.duration-info.duration)<Math.max(.3,info.duration*.001);await inspect(output,{signal});}catch(e){if(signal?.aborted)throw e;}
    if(reusable){fs.unlinkSync(partial);return output;}
    fs.renameSync(output,output+'.anterior-'+Date.now());
  }
  if(output===file)fs.renameSync(file,file+'.original-'+Date.now());
  fs.renameSync(partial,output);
  if(file!==output)fs.unlinkSync(file);
  return output;
}
function concatLine(file) { return "file '" + file.replaceAll('\\', '/').replaceAll("'", "'\\''") + "'"; }
function metadataEscape(value) { return String(value).replace(/[\\=;#\n\r]/g, ch => ch === '\n' || ch === '\r' ? ' ' : '\\' + ch); }
function chapterMetadata(items) {
  let elapsed = 0; const lines = [';FFMETADATA1'];
  for (const item of items) {
    const end = elapsed + Math.round(item.duration * 1000);
    lines.push('[CHAPTER]', 'TIMEBASE=1/1000', `START=${elapsed}`, `END=${end}`, 'title=' + metadataEscape(item.title)); elapsed = end;
  }
  return lines.join('\n') + '\n';
}
function compatible(items) {
  const signature = x => JSON.stringify([x.video?.codec_name, x.video?.profile, x.video?.width, x.video?.height, x.video?.pix_fmt, x.video?.r_frame_rate, x.video?.time_base, x.audio?.codec_name, x.audio?.sample_rate, x.audio?.channels, x.audio?.channel_layout]);
  return items.every(x => signature(x) === signature(items[0]));
}
function ffProgress(duration, callback) {
  return line => { const match = line.match(/^out_time_us=(\d+)/); if (match && duration) callback(Math.min(99, Number(match[1]) / 1000000 / duration * 100)); };
}
function mergeKey(items) {
  return crypto.createHash('sha256').update(JSON.stringify({version:2,sources:items.map(i=>{const s=fs.statSync(i.output);return [path.resolve(i.output),s.size,s.mtimeMs];})})).digest('hex').slice(0,24);
}
function normalizationPlan(infos) {
  const width=Math.min(1920,Math.max(...infos.map(i=>i.video.width))),height=Math.min(1080,Math.max(...infos.map(i=>i.video.height)));
  const rates=new Map();for(const i of infos){const rate=i.video.r_frame_rate;if(/^\d+\/[1-9]\d*$/.test(rate||'')&&parseInt(rate)>0)rates.set(rate,(rates.get(rate)||0)+i.duration);}
  const fps=[...rates].sort((a,b)=>b[1]-a[1])[0]?.[0]||'30/1';
  return {width,height,fps,parts:infos.map(i=>({copyVideo:i.video.codec_name==='h264'&&i.video.pix_fmt==='yuv420p'&&i.video.width===width&&i.video.height===height&&i.video.r_frame_rate===fps&&['1:1',undefined].includes(i.video.sample_aspect_ratio),copyAudio:i.audio.codec_name==='aac'&&i.audio.sample_rate==='48000'&&i.audio.channels===2}))};
}
async function reusablePart(file, source, width, height, signal, fps='30/1') {
  try {
    const info=await probe(file,signal);
    return info.video?.codec_name==='h264' && info.video.width===width && info.video.height===height && info.video.r_frame_rate===fps && info.audio?.codec_name==='aac' && info.audio.sample_rate==='48000' && info.audio.channels===2 && Math.abs(info.duration-source.duration)<Math.max(.5,source.duration*.001);
  } catch { if(signal?.aborted)throw new Error('Operação cancelada.');return false; }
}
async function merge(items, title, { signal, update = () => {} } = {}) {
  const work = path.join(DATA_DIR, 'work', 'merge-'+mergeKey(items)); fs.mkdirSync(work, { recursive: true });
  const infos = [];
  for (const item of items) {
    const info = await probe(item.output, signal); if (!info.video || !info.audio) throw new Error(`O episódio ${item.index} precisa de vídeo e áudio antes de juntar.`); infos.push(info);
  }
  const total = infos.reduce((s, i) => s + i.duration, 0); let files = items.map(i => i.output);
  if (!compatible(infos)) {
    update({ phase: 'Padronizando os episódios para unir sem falhas', progress: 0 }); files = [];
    const {width,height,fps,parts}=normalizationPlan(infos);
    for (let i = 0; i < items.length; i++) {
      const file = path.join(work, `part-${i}.mp4`);
      if(await reusablePart(file,infos[i],width,height,signal,fps)){files.push(file);update({phase:`Reaproveitando episódio ${i+1} de ${items.length}`,progress:(i+1)/items.length*80});continue;}
      const videoArgs=parts[i].copyVideo?['-c:v','copy']:['-vf',`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}`,'-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p'];
      const audioArgs=parts[i].copyAudio?['-c:a','copy']:['-c:a','aac','-b:a','192k','-ar','48000','-ac','2'];
      const phase=(parts[i].copyVideo?'Copiando vídeo sem reconverter':'Padronizando vídeo')+` · episódio ${i+1} de ${items.length}`;
      update({phase,progress:i/items.length*80});
      await execute(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', items[i].output, '-map', '0:v:0', '-map', '0:a:0', ...videoArgs,...audioArgs, '-video_track_timescale', '90000', '-disposition:a:0', 'default', '-progress', 'pipe:1', '-nostats', '-y', file], { signal, onLine: ffProgress(infos[i].duration, p => update({phase,progress:(i+p/100)/items.length*80})) });
      files.push(file);
    }
  }
  const manifest = path.join(work, 'parts.txt'), metadata = path.join(work, 'chapters.txt');
  fs.writeFileSync(manifest, files.map(concatLine).join('\n') + '\n');
  fs.writeFileSync(metadata, chapterMetadata(items.map((item, i) => ({ title: item.title, duration: infos[i].duration }))));
  const partial = path.join(work, 'combined.mp4');
  update({ phase: 'Juntando vídeo, áudio e capítulos', progress: 80 });
  await execute(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-fflags', '+genpts', '-f', 'concat', '-safe', '0', '-i', manifest, '-f', 'ffmetadata', '-i', metadata, '-map', '0:v:0', '-map', '0:a:0', '-map_metadata', '1', '-map_chapters', '1', '-c', 'copy', '-disposition:a:0', 'default', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', '-y', partial], { signal, onLine: ffProgress(total, p => update({ phase: 'Criando o MP4 completo', progress: 80 + p * .17 })) });
  const verification = await inspect(partial, { signal });
  if (Math.abs(verification.duration - total) > Math.max(2, items.length * .15)) throw new Error('A duração do vídeo unido não corresponde à soma dos episódios. Os originais foram preservados.');
  const {titleStem}=require('./library-files.cjs');
  const root=items[0].target||path.dirname(items[0].output),stem=titleStem(root,title);
  let output=path.join(root,stem+'.mp4');
  for(let n=2;fs.existsSync(output);n++)output=path.join(root,stem+` (${n}).mp4`);
  fs.copyFileSync(partial, output, fs.constants.COPYFILE_EXCL);
  // Only remove disposable files created for this operation, never source media.
  for (const file of [partial, manifest, metadata]) { try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch {} }
  try { fs.rmdirSync(work); } catch {}
  return { id: 'export-' + crypto.randomUUID(), title: title + ' · ' + items.length + ' episódios', playlistTitle:title,libraryRoot:root, output, status: 'done', type: 'merged', sourceIds: items.map(i => i.id), media: verification, duration: verification.duration, createdAt: new Date().toISOString() };
}
async function transcribe(item, language, options = {}) { return require('./speech.cjs').transcribe(item,language,options); }
async function detectSpeechLanguage(item, options = {}) { return require('./speech.cjs').detectSpeechLanguage(item,options); }
function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw new Error('Range inválido');
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] ? (match[2] ? Math.min(Number(match[2]), size - 1) : size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) throw new Error('Range inválido');
  return { start, end };
}
function streamFile(req, res, file, mime, download = false) {
  const size = fs.statSync(file).size; let range;
  try { range = parseRange(req.headers.range, size); } catch { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
  const headers = { 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Content-Length': range ? range.end - range.start + 1 : size, 'Cache-Control': 'private, no-cache' };
  if (download) headers['Content-Disposition'] = "attachment; filename*=UTF-8''" + encodeURIComponent(path.basename(file));
  if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`;
  res.writeHead(range ? 206 : 200, headers);
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(file, range || {}); stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
}
module.exports = { execute, probe, inspect, thumbnail, merge, mergeKey, reusablePart, normalizationPlan, playbackPlan,finalizeDownload, transcribe, detectSpeechLanguage, compatible, concatLine, chapterMetadata, parseRange, streamFile };
