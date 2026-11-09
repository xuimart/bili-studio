const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { discover, safeName, normalizeUrl } = require('./library.cjs');
const media = require('./media.cjs');
const { translateCaptions } = require('./translate.cjs');
const { loadState, createStateStore } = require('./state-store.cjs');
const { findEngine, MODEL } = require('./whisper.cjs');
const { prefetch } = require('./fast-download.cjs');
const {APP_ROOT:ROOT,DATA_DIR,BIN_DIR,DOWNLOAD_DIR}=require('./runtime-paths.cjs');
const DEFAULT_URL = '';
function launch(executable, args) { return spawn(executable, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] }); }
function run(executable, args) {
  return new Promise((resolve, reject) => {
    const child = launch(executable, args); let out = '', err = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => out += chunk); child.stderr.on('data', chunk => err += chunk);
    child.on('error', reject); child.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || `O comando terminou com código ${code}.`)));
  });
}
function buildArgs(entry, options) {
  const cap = options.quality === 'best' ? '' : `[height<=${options.quality}]`;
  const exclude=(entry.excludedAudioFormats||[]).filter(x=>/^\d+$/.test(x)).map(x=>`[format_id!^=${x}]`).join('');
  const format = `bv[ext=mp4]${cap}+ba[ext=m4a]${exclude}/bv${cap}+ba${exclude}/b${cap}`;
  const template = fileStem(entry).replaceAll('%', '%%') + '.%(ext)s';
  const args = ['--ignore-config', '--no-playlist', '--no-simulate', '--no-quiet', '--no-overwrites', '--continue', '--windows-filenames', '--newline', '--progress', '--progress-delta', '1', '--encoding','utf-8','--http-chunk-size','1M','--socket-timeout', '15', '--retries', '3', '--fragment-retries', '3', '--concurrent-fragments', '2', '--retry-sleep', 'http:3', '--ffmpeg-location', options.ffmpeg, '--merge-output-format', 'mkv', '--remux-video', 'mkv', '--embed-metadata', '--embed-chapters', '-f', format, '-o', template,
    '-P', 'home:' + options.target, '-P', 'temp:' + path.join(options.target, '.em-andamento'), '--progress-template', 'download:@@PROGRESS@@{"downloaded":%(progress.downloaded_bytes|0)j,"total":%(progress.total_bytes,progress.total_bytes_estimate|0)j,"speed":%(progress.speed|0)j,"eta":%(progress.eta|0)j,"status":%(progress.status)j}', '--print', 'after_move:@@FILE@@%(filepath)j'];
  if (options.cookieFile) args.push('--cookies', options.cookieFile);
  return [...args, '--', entry.url];
}
function recoverDownload(job,message,format) {
  if(!/bytes read|timed out|HTTP Error (?:403|429|5\d\d)|Connection.*(?:reset|closed)|Giving up after/i.test(message))return false;
  if((job.recoveryAttempts||0)>=2)return false;
  job.recoveryAttempts=(job.recoveryAttempts||0)+1;
  if(format?.ext==='m4a' && /^\d+$/.test(format.id)){
    job.excludedAudioFormats=[...new Set([...(job.excludedAudioFormats||[]),format.id])];
    job.recoveryNote='Tentando outra faixa de áudio fornecida pelo Bilibili; vídeo já baixado será mantido.';
  }else job.recoveryNote='Renovando a conexão e retomando os arquivos parciais.';
  return true;
}
function fileStem(entry) { return `${String(entry.index).padStart(3, '0')} - ${safeName(entry.title, 45)} [${entry.bvid}-p${entry.page}]`; }
function separateTemporaryFiles(job) {
  if (!job.target || !fs.existsSync(job.target)) return;
  const temp = path.join(job.target, '.em-andamento'); fs.mkdirSync(temp, { recursive: true });
  for (const name of fs.readdirSync(job.target)) {
    if (!name.startsWith(fileStem(job) + '.') || !/\.f\d+\.(mp4|m4a)(\.part|\.ytdl)?$|\.part$|\.ytdl$/.test(name)) continue;
    const source = path.join(job.target, name); if (!fs.statSync(source).isFile()) continue;
    const destination = path.join(temp, name);
    fs.renameSync(source, fs.existsSync(destination) ? destination + '.preservado-' + Date.now() : destination);
  }
}
function createApp(options = {}) {
  const dataDir = options.dataDir || DATA_DIR; fs.mkdirSync(dataDir, { recursive: true });
  const stateFile = path.join(dataDir, 'state.json');
  const saved = loadState(stateFile);
  const state = { url: DEFAULT_URL, folder: DOWNLOAD_DIR, quality: 'best', cookieFile: '', library: null, jobs: [], logs: [], exports: [], operation: null, linkQueue: [], ...saved, queueEnabled: false, busy: false, discovering: false, auditing: false };
  for (const item of state.linkQueue) if (item.status === 'running') item.status = 'paused';
  for (const job of state.jobs) if (['downloading', 'queued', 'merging', 'checking'].includes(job.status)) job.status = 'paused';
  if (state.operation?.status === 'running') { state.operation.status = 'interrupted'; state.operation.phase = 'Interrompido ao encerrar o painel. Você pode iniciar novamente.'; }
  if (['downloading','processing'].includes(state.workflow?.status)) state.workflow.status = 'paused';
  const token = options.token || crypto.randomBytes(32).toString('hex');
  let active = null, stopping = false, mutation = false, operationController = null, downloadController = null, pumping = false, closing = false;
  const ytdlp = options.ytdlp || path.join(BIN_DIR, 'yt-dlp.exe');
  const ffmpeg = fs.existsSync(path.join(BIN_DIR, 'ffmpeg.exe')) ? BIN_DIR : 'ffmpeg';
  const store = createStateStore(stateFile, () => state, { onWarning: warning => { state.persistenceWarning = warning; } });
  const persist = store.persist;
  function log(message, type = 'info') { state.logs.push({ time: new Date().toISOString(), type, message: String(message).slice(0, 1300) }); state.logs = state.logs.slice(-100); persist(); }
  function publicState() {
    return { ...state, desktop:!!options.choosePath, tools: { downloader: fs.existsSync(ytdlp), ffmpeg: fs.existsSync(path.join(BIN_DIR, 'ffmpeg.exe')) || ffmpeg === 'ffmpeg', whisper: !!findEngine() && fs.existsSync(MODEL) }, summary: { total: state.jobs.length, done: state.jobs.filter(j => j.status === 'done').length, failed: state.jobs.filter(j => j.status === 'error').length } };
  }
  async function inspectJob(job) {
    job.media = await (options.inspectMedia || media.inspect)(job.output);
    if (!options.inspectMedia) job.thumbnail = await media.thumbnail(job.output, job.id).catch(() => null);
  }
  async function audit() {
    state.auditing = true;
    try {
      for (const job of state.jobs) {
        separateTemporaryFiles(job);
        if (job.status !== 'done') continue;
        try { if (!job.output || !fs.existsSync(job.output)) throw new Error('Arquivo não encontrado. Retome para baixar novamente.'); await inspectJob(job); }
        catch (error) { job.status = 'error'; job.error = error.message; log(error.message, 'error'); }
      }
    } finally { state.auditing = false; persist(true); void pumpQueue(); }
  }
  function selectedFinished(ids, includeExports = false) {
    if (!Array.isArray(ids) || !ids.length) throw new Error('Selecione pelo menos um vídeo.');
    const pool = [...(includeExports ? [...state.jobs, ...state.exports] : state.jobs)].reverse();
    const seen = new Set();
    return ids.map(id => {
      if (seen.has(id)) throw new Error('A seleção contém episódios repetidos.'); seen.add(id);
      const item = pool.find(j => j.id === id);
      if (!item || item.status !== 'done' || !item.output || !fs.existsSync(item.output)) throw new Error('Aguarde o download dos vídeos selecionados terminar.');
      return item;
    }).sort((a, b) => (a.index || 0) - (b.index || 0));
  }
  function startOperation(type, items, language = 'auto', processing = {}) {
    if (state.operation?.status === 'running' || state.auditing) throw new Error('Aguarde a operação atual terminar.');
    if (state.busy) throw new Error('Pause os downloads ou aguarde a fila terminar antes de processar.');
    operationController = new AbortController(); const signal = operationController.signal;
    state.operation = { id: crypto.randomUUID(), type, status: 'running', phase: 'Preparando…', progress: 0, total: items.length, completed: 0, sourceIds: items.map(i => i.id), startedAt: new Date().toISOString() };
    const operation = state.operation;
    const update = p => { Object.assign(operation, p, { updatedAt:new Date().toISOString() }); persist(); };
    const hasMerge = type === 'merge' || (type === 'workflow' && processing.merge);
    const hasCaptions = type === 'subtitles' || (type === 'workflow' && processing.subtitles);
    const hasTranslation = hasCaptions && processing.subtitleLanguage === 'pt';
    const mergeEnd = hasCaptions ? 60 : 100;
    const captionStart = hasMerge ? mergeEnd : 0, captionEnd = hasTranslation ? 80 : 100;
    const stageUpdate = (stage, from, to) => p => update({...p, stage, stageProgress:p.progress||0,progress:from+(to-from)*(p.progress||0)/100});
    persist(true);
    void (async () => {
      try {
        let captionItems = items;
        if (hasMerge) {
          const reusable = [...state.exports].reverse().find(e=>e.sourceIds?.length===items.length && e.sourceIds.every((id,i)=>id===items[i].id) && fs.existsSync(e.output) && items.every(i=>fs.statSync(i.output).mtimeMs<=fs.statSync(e.output).mtimeMs));
          update({stage:'merge',phase:reusable?'Reaproveitando o vídeo já unido':'Preparando a união',progress:0});
          const result = reusable || await (options.mergeMedia || media.merge)(items, processing.title || state.library?.title || 'Biblioteca', { signal, update:stageUpdate('merge',0,mergeEnd) });
          if (!options.mergeMedia) result.thumbnail = await media.thumbnail(result.output, result.id, signal).catch(() => null);
          if (!reusable) state.exports.push(result); operation.resultId = result.id; persist(true);
          captionItems = [result];
        }
        if (hasCaptions) {
          for (let index = 0; index < captionItems.length; index++) {
            const item = captionItems[index]; update({ currentId: item.id, currentTitle: item.title, completed: index });
            const existing = item.subtitles?.original || item.subtitles;
            let reusable = existing?.srt && fs.existsSync(existing.srt) && (language==='auto'||existing.language===language);
            if(reusable && language==='auto' && !existing.detectionVersion && !options.transcribeMedia){
              const detection=await media.detectSpeechLanguage(item,{signal,update:stageUpdate('transcribe',captionStart,captionEnd)});
              const quality=require('./speech.cjs').transcriptQuality(require('./translate.cjs').parseSrt(fs.readFileSync(existing.srt,'utf8')));
              reusable=!detection.mixed && detection.language===existing.language && !quality.suspicious;
              if(reusable){existing.languageDetection=detection;existing.detectionVersion=2;}
            }
            if(!reusable && item.subtitles){(item.subtitleHistory ||= []).push(item.subtitles);persist(true);}
            item.subtitles = reusable ? existing : await (options.transcribeMedia || media.transcribe)(item, language, { signal, update:stageUpdate('transcribe',captionStart,captionEnd) });
            if (processing.subtitleLanguage === 'pt' && item.subtitles.language !== 'pt') {
              const original = item.subtitles; persist(true);
              item.subtitles = await (options.translateCaptions || translateCaptions)(original, { signal, update:stageUpdate('translate',captionEnd,100) });
            }
            if(item.subtitles.language==='pt' && !options.transcribeMedia){
              const alias=item.output.replace(/\.mp4$/i,'')+'.srt';
              if(fs.existsSync(alias)&&!fs.readFileSync(alias).equals(fs.readFileSync(item.subtitles.srt)))fs.copyFileSync(alias,alias+'.anterior-'+Date.now());
              fs.copyFileSync(item.subtitles.srt,alias);item.subtitles.playbackSrt=alias;
            }
            operation.completed = index + 1; persist(true);
          }
        }
        update({ status: 'done', phase: type === 'workflow' ? 'Tudo pronto. Os arquivos estão na pasta escolhida.' : type === 'merge' ? 'Vídeo unido pronto, com áudio e capítulos.' : 'Legendas prontas para assistir e baixar.', progress: 100, completed: items.length, completedAt: new Date().toISOString() });
        if (type === 'workflow') state.workflow.status = 'done';
        log(operation.phase, 'success');
      } catch (error) {
        if (type === 'workflow') state.workflow.status = signal.aborted ? 'cancelled' : 'error';
        update({ status: signal.aborted ? 'cancelled' : 'error', phase: signal.aborted ? 'Operação cancelada. Os vídeos originais foram preservados.' : error.message, error: signal.aborted ? '' : error.message });
        log(operation.phase, signal.aborted ? 'info' : 'error');
      } finally { operationController = null; completeQueueItem(); persist(true); void pumpQueue(); }
    })();
  }
  async function worker() {
    if (active || state.busy) return;
    stopping = false; state.busy = true; persist();
    try {
      while (!stopping) {
        const job = state.jobs.find(j => j.status === 'queued');
        if (!job) break;
        separateTemporaryFiles(job);
        const existing = job.output || path.join(job.target, fileStem(job) + '.mp4');
        if (fs.existsSync(existing)) {
          try { job.output = existing; await inspectJob(job); job.status = 'done'; job.progress = 100; persist(true); continue; }
          catch { fs.renameSync(existing, path.join(job.target, '.em-andamento', path.basename(existing) + '.incompleto-' + Date.now())); job.output = null; }
        }
        job.status = 'downloading'; job.error = ''; job.progress = 0; job.speed = 0; job.eta = 0; persist();
        log(`Iniciando ${job.index.toString().padStart(2, '0')}: ${job.title}`);
        if(!options.spawnDownload){
          downloadController=new AbortController();job.transferMode='parallel';
          try{
            const args=buildArgs(job,{target:job.target,quality:job.quality,cookieFile:job.cookieFile??state.cookieFile,ffmpeg});
            await prefetch(job,{ytdlp,target:job.target,stem:fileStem(job),format:args[args.indexOf('-f')+1],cookieFile:job.cookieFile??state.cookieFile,signal:downloadController.signal,log:message=>{job.transferDetail=message;log(message);},update:p=>{Object.assign(job,{progress:Math.round(p.progress),speed:p.speed,downloaded:p.downloaded,bytesTotal:p.total});persist();}});
          }catch(error){
            if(!stopping){job.transferMode='standard';job.transferDetail='Retomando pelo downloader padrão';log('Transferência paralela indisponível neste trecho: '+error.message+'. Retomando pelo downloader padrão.','warning');}
          }finally{downloadController=null;}
          if(stopping){job.status='paused';persist(true);break;}
        }
        await new Promise(resolve => {
          let lastError = '', output = '', settled = false, lastFormat=null, failedFormat=null;
          const journal=path.join(dataDir,'download-logs');fs.mkdirSync(journal,{recursive:true});job.downloadLog=path.join(journal,crypto.createHash('sha256').update(job.id).digest('hex').slice(0,24)+'.log');
          const args = buildArgs(job, { target: job.target, quality: job.quality, cookieFile: job.cookieFile ?? state.cookieFile, ffmpeg });
          const child = options.spawnDownload ? options.spawnDownload(args) : launch(ytdlp, args); active = child;
          function line(text) {
            text=text.replace(/\x1b\[[0-9;]*m/g,'').replace(/\r/g,'').trim();
            if(!text.startsWith('@@PROGRESS@@')){try{fs.appendFileSync(job.downloadLog,new Date().toISOString()+' '+text+'\n');}catch{}}
            const fmt=text.match(/\.f(\d+)\.(m4a|mp4)/);if(fmt)lastFormat={id:fmt[1],ext:fmt[2]};
            const selection=text.match(/Downloading 1 format\(s\): (\d+)\+/);if(selection)lastFormat={id:selection[1],ext:'mp4'};
            if(/Giving up after|ERROR:\s*\S/i.test(text)&&lastFormat)failedFormat??={...lastFormat};
            if (text.startsWith('@@PROGRESS@@')) {
              try { const p = JSON.parse(text.slice(12)); const total = Number(p.total); job.progress = total > 0 ? Math.min(99, Math.round(Number(p.downloaded) / total * 100)) : 0; job.speed = Number(p.speed) || 0; job.eta = Number(p.eta) || 0; job.downloaded = Number(p.downloaded) || 0; job.bytesTotal = total || 0; persist(); } catch {}
            } else if (text.startsWith('@@FILE@@')) {
              try { output = JSON.parse(text.slice(8)); } catch {}
            } else {
              if (/\[(Merger|VideoRemuxer|Metadata|EmbedSubtitle|Fixup)/.test(text)) { job.status = 'merging'; job.speed = 0; persist(); }
              if (text.startsWith('ERROR:')&&text.slice(6).trim()) lastError=text.slice(6).trim();
              else if (/Got error:|Giving up|timed out|Connection.*(?:reset|closed)/i.test(text)) lastError=text;
              if (text.trim() && !text.startsWith('[download]')) log(text, text.startsWith('ERROR:') ? 'error' : text.startsWith('WARNING:') ? 'warning' : 'info');
            }
          }
          readline.createInterface({ input: child.stdout }).on('line', line);
          readline.createInterface({ input: child.stderr }).on('line', line);
          async function finish(error, code) {
            if (settled) return; settled = true; active = null;
            job.speed = 0; job.eta = 0;
            if (stopping) { job.status = 'paused'; log('Fila pausada. Os arquivos parciais foram preservados.'); }
            else if (!error && code === 0 && output && fs.existsSync(output)) {
              job.status = 'checking'; job.output = output; persist();
              try {
                if(!options.inspectMedia)job.output=await media.finalizeDownload(output,{update:p=>{job.transferDetail=p.phase||job.transferDetail;job.progress=p.progress||0;persist();}});
                await inspectJob(job); job.status = 'done'; job.progress = 100; job.completedAt = new Date().toISOString();
                log(`Concluído com vídeo e áudio: ${job.title}`, 'success');
              } catch (e) { job.status = 'error'; job.error = e.message; log(`Falha na verificação de áudio: ${job.title} — ${e.message}`, 'error'); }
            } else {
              const message=error?.message||lastError||`Download terminou sem arquivo final (código ${code}).`;
              if (recoverDownload(job,message,failedFormat||lastFormat)) { job.status='queued';job.error='';log('Retentativa automática: '+job.title+' · '+job.recoveryNote,'warning'); }
              else {job.status='error';job.error=message;log(`Falha: ${job.title} — ${job.error}`,'error');}
            }
            persist(true); resolve();
          }
          child.on('error', error => finish(error)); child.on('close', code => finish(null, code));
        });
      }
    } catch (error) { log(error.message, 'error'); if (state.workflow) state.workflow.error = error.message; }
    finally {
      state.busy = false; active = null;
      const flow = state.workflow;
      if (!stopping && flow?.status === 'downloading') {
        const items = flow.ids.map(id => state.jobs.find(j => j.id === id && j.target === flow.target));
        if (items.every(j => j?.status === 'done')) {
          if (flow.merge || flow.subtitles) { flow.status = 'processing'; startOperation('workflow', items, flow.language, flow); }
          else flow.status = 'done';
        } else { flow.status = 'blocked'; log('Retome os episódios com erro para concluir as opções escolhidas.', 'warning'); }
      }
      completeQueueItem(); persist(true); void pumpQueue();
    }
  }
  async function pause() {
    state.queueEnabled = false;
    stopping = true;
    downloadController?.abort();
    if (state.workflow?.status === 'downloading') state.workflow.status = 'paused';
    for (const job of state.jobs) if (job.status === 'queued') job.status = 'paused';
    if (active) {
      const child = active;
      if (process.platform === 'win32') {
        try { await run('taskkill.exe', ['/PID', String(child.pid), '/T', '/F']); }
        catch {
          // WMI/taskkill can be disabled on managed Windows. Match only this app's
          // private executable paths, including the PyInstaller child and FFmpeg.
          const targets = Buffer.from(JSON.stringify([ytdlp, path.join(BIN_DIR, 'ffmpeg.exe')])).toString('base64');
          const script = `$ProgressPreference='SilentlyContinue'; $targets=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${targets}')) | ConvertFrom-Json; $ownedProcesses=@(Get-Process -Name yt-dlp,ffmpeg -ErrorAction SilentlyContinue | Where-Object { $targets -contains $_.Path }); foreach ($ownedProcess in $ownedProcesses) { try { Stop-Process -Id $ownedProcess.Id -Force -ErrorAction Stop } catch { if (Get-Process -Id $ownedProcess.Id -ErrorAction SilentlyContinue) { [Console]::Error.Write('Nao foi possivel interromper o downloader.'); exit 1 } } }; exit 0`;
          try { await run('powershell.exe', ['-NoProfile', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]); }
          catch (error) { if (active) throw error; }
        }
      }
      else child.kill('SIGTERM');
    }
    persist(true);
  }
  function processingOptions(body) {
    const p = { merge:false, subtitles:false, language:'auto', subtitleLanguage:'original', ...body.processing };
    if (typeof p.merge !== 'boolean' || typeof p.subtitles !== 'boolean' || !['auto','en','pt','zh','es','fr','ja','de','it','ko'].includes(p.language) || !['original','pt'].includes(p.subtitleLanguage)) throw new Error('Opções de processamento inválidas.');
    return p;
  }
  function destination(library, folder) {
    const target = path.join(folder, safeName(library.title,40) + ' [' + safeName(library.id) + ']');
    if (target.length > 150) throw new Error('O caminho da pasta é longo demais. Escolha uma pasta mais curta, por exemplo C:\\Videos.');
    return target;
  }
  function startDownload(library, body, queueItem) {
    if (!library) throw new Error('Analise uma playlist primeiro.');
    if (!fs.existsSync(ytdlp)) throw new Error('Execute ABRIR-BIBLIOTECA-BILIBILI.cmd para instalar o motor de download.');
    const settings = checkSettings(body), processing = processingOptions(body);
    const selected = new Set(body.ids || []);
    let entries = library.entries.filter(e => selected.has(e.id));
    if (!entries.length) throw new Error('Selecione pelo menos um vídeo.');
    if (processing.merge && entries.length < 2) {
      if (queueItem) processing.merge = false;
      else throw new Error('Selecione pelo menos dois vídeos para juntar.');
    }
    const target = destination(library,settings.folder);
    fs.mkdirSync(target,{recursive:true});
    if (queueItem) entries = entries.map(e=>({...e,entryId:e.id,id:queueItem.id+':'+e.id}));
    const ids = new Set(entries.map(e=>e.id));
    for (const entry of entries) {
      let job = state.jobs.find(j=>j.id===entry.id && j.target===target);
      if (job?.status==='done' && job.output && fs.existsSync(job.output)) continue;
      if (job) Object.assign(job,{status:'queued',error:'',quality:settings.quality,cookieFile:settings.cookieFile});
      else state.jobs.push({...entry,target,quality:settings.quality,cookieFile:settings.cookieFile,status:'queued',progress:0,error:''});
    }
    for (const job of state.jobs) if (job.status==='queued' && (job.target!==target || !ids.has(job.id))) job.status='paused';
    state.workflow={...processing,ids:[...ids],target,title:library.title,queueId:queueItem?.id,status:'downloading'};
    if (queueItem) { queueItem.target=target;queueItem.jobIds=[...ids];queueItem.status='running';queueItem.error=''; }
    else { Object.assign(state,settings);state.processingPrefs={...processing}; }
    persist(true);void worker();
  }
  function completeQueueItem() {
    const flow=state.workflow,item=state.linkQueue.find(q=>q.id===flow?.queueId);
    if (!item || item.status!=='running' || ['downloading','processing'].includes(flow.status)) return;
    item.status=flow.status==='done'?'done':['paused','cancelled'].includes(flow.status)?'paused':'error';
    item.resultId=flow.merge && state.operation?.status==='done' && state.operation.type==='workflow' && state.operation.sourceIds.every(id=>flow.ids.includes(id)) ? state.operation.resultId : undefined;
    const failed=state.jobs.filter(j=>flow.ids.includes(j.id)&&j.target===flow.target&&j.status==='error');
    item.failedStage=failed.length?'download':item.status==='error'?'processing':null;
    item.error=item.status==='error' ? (failed.length?`Download incompleto nos episódios ${failed.map(j=>j.index).join(', ')}. União e legenda ainda não iniciaram. ${failed[0].error}`:flow.error || (state.operation?.status==='error' ? state.operation.error : 'Não foi possível concluir. Retome para tentar novamente.')) : '';
    if (item.status==='paused') state.queueEnabled=false;
    if (item.status==='done') item.completedAt=new Date().toISOString();
  }
  async function pumpQueue() {
    if (closing || pumping || !state.queueEnabled || state.busy || state.auditing || state.operation?.status==='running') return;
    pumping=true;
    try {
      while (state.queueEnabled && !closing) {
        const item=state.linkQueue.find(q=>q.status==='pending');
        if (!item) { state.queueEnabled=false;break; }
        item.status='running';item.phase='Buscando vídeos…';persist(true);
        try {
          item.library ||= await (options.discover || discover)(item.url,item.settings.cookieFile);
          item.title=item.library.title;item.ids ||= item.library.entries.map(e=>e.id);
          if (closing || !state.queueEnabled) { item.status='pending';break; }
          item.phase='Baixando e preparando arquivos';
          startDownload(item.library,{...item.settings,ids:item.ids,processing:item.processing},item);
          return;
        } catch(error) { item.status='error';item.error=error.message;log('Fila: '+error.message,'error');persist(true); }
      }
    } finally { pumping=false;persist(true);if(state.queueEnabled && !state.busy && !state.auditing && state.operation?.status!=='running' && !closing) queueMicrotask(()=>void pumpQueue()); }
  }
  function addQueue(body) {
    const settings=checkSettings(body),processing=processingOptions(body);
    const urls=body.urls ? body.urls : [state.library?.source];
    if (!Array.isArray(urls) || !urls.length || urls.length>50) throw new Error('Adicione de 1 a 50 links por vez.');
    const normalized=[...new Set(urls.map(normalizeUrl))];
    let ids;
    if (!body.urls) {
      if (!state.library) throw new Error('Busque os vídeos primeiro.');
      ids=state.library.entries.filter(e=>(body.ids||[]).includes(e.id)).map(e=>e.id);
      if (!ids.length) throw new Error('Selecione pelo menos um vídeo.');
      destination(state.library,settings.folder);
    }
    // Validate the entire batch before persisting any item.
    for (const url of normalized) state.linkQueue.push({id:crypto.randomUUID(),url,title:body.urls?url:state.library.title,library:body.urls?null:structuredClone(state.library),ids:ids?.slice(),settings:{...settings},processing:{...processing},status:'pending',createdAt:new Date().toISOString()});
    state.processingPrefs={...processing};Object.assign(state,settings);persist(true);
    void pumpQueue();
  }
  const chooser = async type => {
    if(options.choosePath)return options.choosePath(type);
    if (process.platform !== 'win32') throw new Error('O seletor de pastas está disponível no Windows. Digite o caminho no campo.');
    const script = type === 'folder'
      ? "$ProgressPreference='SilentlyContinue'; Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description = 'Escolha onde salvar os videos'; $dialog.ShowNewFolderButton = $true; if ($dialog.ShowDialog() -eq 'OK') { [Console]::OutputEncoding = [Text.Encoding]::UTF8; [Console]::Write($dialog.SelectedPath) }"
      : "$ProgressPreference='SilentlyContinue'; Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.OpenFileDialog; $dialog.Title = 'Cookies do Bilibili em formato Netscape'; $dialog.Filter = 'Cookies (*.txt)|*.txt'; if ($dialog.ShowDialog() -eq 'OK') { [Console]::OutputEncoding = [Text.Encoding]::UTF8; [Console]::Write($dialog.FileName) }";
    return run('powershell.exe', ['-NoProfile', '-STA', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]);
  };
  function checkSettings(body) {
    if (!['best', '1080', '720', '480', '360'].includes(body.quality || state.quality)) throw new Error('Qualidade inválida.');
    const folder = body.folder || state.folder;
    if (typeof folder !== 'string' || !path.isAbsolute(folder) || folder.includes('\0')) throw new Error('Informe um caminho completo para a pasta.');
    const cookieFile = body.cookieFile ?? state.cookieFile;
    if (typeof cookieFile !== 'string' || (cookieFile && (!path.isAbsolute(cookieFile) || !fs.existsSync(cookieFile) || !fs.statSync(cookieFile).isFile()))) throw new Error('Arquivo de cookies não encontrado.');
    return { folder: path.resolve(folder), quality: body.quality || state.quality, cookieFile };
  }
  const server = http.createServer(async (req, res) => {
    const port = server.address()?.port;
    const origin = `http://127.0.0.1:${port}`;
    const send = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
    if (req.headers.host !== `127.0.0.1:${port}`) return send(403, { error: 'Acesso permitido apenas neste computador.' });
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const url = new URL(req.url, origin);
    if (req.method === 'GET' && url.pathname === '/' && url.searchParams.get('token') === token) {
      res.writeHead(303, { Location: '/', 'Set-Cookie': `bilibili_session=${token}; HttpOnly; SameSite=Strict; Path=/`, 'Cache-Control': 'no-store' }); return res.end();
    }
    if (!req.headers.cookie?.split(';').some(p => p.trim() === `bilibili_session=${token}`)) return send(401, { error: 'Abra o Bili Studio pelo atalho do aplicativo.' });
    if (req.method === 'GET' && url.pathname === '/api/state') return send(200, publicState());
    if (['GET', 'HEAD'].includes(req.method) && ['/api/media', '/api/thumbnail', '/api/subtitle'].includes(url.pathname)) {
      const item = [...state.jobs, ...state.exports].findLast(j => j.id === url.searchParams.get('id'));
      if (!item || item.status !== 'done') return send(404, { error: 'Vídeo ainda não disponível.' });
      let file, mime;
      if (url.pathname === '/api/media') { if (!item.media?.audioVerified) return send(409, { error: 'O áudio deste vídeo ainda está sendo verificado.' }); file = item.output; mime = 'video/mp4'; }
      if (url.pathname === '/api/thumbnail') { file = item.thumbnail; mime = 'image/jpeg'; }
      if (url.pathname === '/api/subtitle') { const format = url.searchParams.get('format') || 'vtt'; if (!['vtt', 'srt', 'txt'].includes(format)) return send(400, { error: 'Formato inválido.' }); file = item.subtitles?.[format]; mime = format === 'vtt' ? 'text/vtt; charset=utf-8' : 'text/plain; charset=utf-8'; }
      if (!file || !fs.existsSync(file)) return send(404, { error: 'Arquivo indisponível.' });
      return media.streamFile(req, res, file, mime, url.searchParams.get('download') === '1');
    }
    if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
      if (req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json')) return send(403, { error: 'Origem inválida.' });
      if (mutation) return send(409, { error: 'Uma operação já está em andamento. Aguarde.' });
      mutation = true;
      try {
        let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 128000) throw new Error('Pedido muito grande.'); }
        const body = JSON.parse(text || '{}');
        if (pumping && ['/api/start','/api/merge','/api/subtitles','/api/settings'].includes(url.pathname)) throw new Error('A fila está preparando um link. Adicione os próximos itens à fila.');
        if (state.operation?.status === 'running' && !['/api/cancel-operation','/api/shutdown','/api/open-folder','/api/discover','/api/browse-folders','/api/choose-cookies','/api/queue/add','/api/queue/start','/api/queue/pause','/api/queue/remove','/api/queue/retry'].includes(url.pathname)) throw new Error('Aguarde o processamento terminar ou cancele a operação atual.');
        if (state.auditing && ['/api/start', '/api/discover', '/api/merge', '/api/subtitles'].includes(url.pathname)) throw new Error('Verificando os arquivos. Aguarde um instante.');
        if (url.pathname === '/api/queue/add') {
          addQueue(body);
        } else if (url.pathname === '/api/queue/start') {
          for (const item of state.linkQueue) if (item.status==='paused') item.status='pending';
          state.queueEnabled=true;persist(true);void pumpQueue();
        } else if (url.pathname === '/api/queue/pause') {
          state.queueEnabled=false;persist(true);
        } else if (url.pathname === '/api/queue/remove' || url.pathname === '/api/queue/retry') {
          const item=state.linkQueue.find(q=>q.id===body.id);
          if (!item || item.status==='running') throw new Error('Aguarde este item terminar.');
          if (url.pathname.endsWith('/remove')) state.linkQueue=state.linkQueue.filter(q=>q.id!==item.id);
          else { if (!['error','paused'].includes(item.status)) throw new Error('Este item não precisa ser retomado.');item.status='pending';item.error='';for(const j of state.jobs.filter(j=>item.jobIds?.includes(j.id)))j.recoveryAttempts=0; }
          persist(true);void pumpQueue();
        } else if (url.pathname === '/api/browse-folders') {
          const requested = body.path || state.folder;
          if (typeof requested !== 'string' || !path.isAbsolute(requested) || requested.includes('\0')) throw new Error('Informe um caminho completo para navegar.');
          const current = path.resolve(requested);
          let directories;
          try { directories = fs.readdirSync(current, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => ({name:e.name,path:path.join(current,e.name)})).sort((a,b)=>a.name.localeCompare(b.name)); }
          catch { throw new Error('Não foi possível abrir esta pasta. Confira o caminho e o acesso.'); }
          const drives = process.platform === 'win32' ? 'CDEFGHIJKLMNOPQRSTUVWXYZAB'.split('').map(l=>l+':\\').filter(p=>fs.existsSync(p)) : ['/'];
          return send(200, { path:current,parent:path.dirname(current),directories,drives });
        } else if (url.pathname === '/api/discover') {

          const settings = checkSettings(body); state.discovering = true;
          try {
            const library = await (options.discover || discover)(body.url, settings.cookieFile);
            Object.assign(state, settings, { library, url: library.source });
            log(`${library.entries.length} vídeo(s) encontrados: ${library.title}`, 'success');
          } finally { state.discovering = false; persist(true); }
        } else if (url.pathname === '/api/settings') {
          if (state.busy) throw new Error('Pause a fila antes de alterar as opções.');
          Object.assign(state, checkSettings(body)); persist(true);
        } else if (url.pathname === '/api/start') {
          if (state.busy || pumping || state.queueEnabled) throw new Error('A fila já está em andamento. Adicione a seleção à fila.');
          startDownload(state.library,body);
        } else if (url.pathname === '/api/merge') {
          const items = selectedFinished(body.ids); if (items.length < 2) throw new Error('Selecione pelo menos dois episódios para juntar.'); startOperation('merge', items);
        } else if (url.pathname === '/api/subtitles') {
          const language = body.language || 'auto'; if (!['auto', 'pt', 'en', 'zh', 'es', 'fr', 'ja', 'de', 'it', 'ko'].includes(language)) throw new Error('Idioma não suportado.');
          startOperation('subtitles', selectedFinished(body.ids, true), language);
        } else if (url.pathname === '/api/cancel-operation') {
          state.queueEnabled=false;operationController?.abort();
        } else if (url.pathname === '/api/pause' || url.pathname === '/api/shutdown') {
          if (url.pathname === '/api/shutdown') { closing=true;state.queueEnabled=false; }
          if (url.pathname === '/api/shutdown' && operationController) {
            operationController.abort(); const deadline = Date.now() + 10000;
            while (operationController && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
            if (operationController) throw new Error('Aguarde o processamento encerrar.');
          }
          await pause();
          const deadline = Date.now() + 10000;
          while (state.busy && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
          if (state.busy) throw new Error('A transferência ainda está sendo interrompida. Aguarde alguns segundos.');
          if (url.pathname === '/api/shutdown') { persist(true); send(200, { message: 'Painel encerrado.' }); server.close(); return; }
        }
        else if (url.pathname === '/api/choose-folder' || url.pathname === '/api/choose-cookies') return send(200, { path: await chooser(url.pathname.endsWith('folder') ? 'folder' : 'file') });
        else if (url.pathname === '/api/open-folder') {
          const target = state.jobs.at(-1)?.target || state.folder;
          fs.mkdirSync(target, { recursive: true });
          const child = spawn('explorer.exe', [target], { windowsHide: true, detached: true, stdio: 'ignore', shell: false }); child.on('error', e => log(e.message, 'error')); child.unref();
        } else return send(404, { error: 'Operação não encontrada.' });
        return send(200, publicState());
      } catch (error) { log(error.message, 'error'); return send(400, { error: error.message }); }
      finally { mutation = false; }
    }
    if (req.method === 'GET') {
      const name = { '/': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css' }[url.pathname];
      if (name) {
        const mime = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html';
        res.writeHead(200, { 'Content-Type': mime + '; charset=utf-8', 'Cache-Control': 'no-store' }); return fs.createReadStream(path.join(ROOT, 'public', name)).pipe(res);
      }
    }
    send(404, { error: 'Não encontrado.' });
  });
  server.on('close',()=>{closing=true;state.queueEnabled=false;store.close();});
  return { server, state, token, pause, persist, publicState, audit };
}
async function main() {
  const runtime = path.join(DATA_DIR,'runtime.json');
  let old = {};
  // Reopen the one existing instance instead of starting competing download queues.
  try {
    old = JSON.parse(fs.readFileSync(runtime, 'utf8'));
    const response = await fetch(`http://127.0.0.1:${old.port}/api/state`, { headers: { Cookie: `bilibili_session=${old.token}` }, signal: AbortSignal.timeout(1500) });
    if (response.ok) { if (!process.argv.includes('--no-open')) spawn('cmd.exe', ['/c', 'start', '', `http://127.0.0.1:${old.port}/?token=${old.token}`], { windowsHide: true, stdio: 'ignore' }).unref(); console.log('Painel já está aberto.'); return; }
  } catch {}
  const app = createApp({ token:/^[a-f0-9]{64}$/.test(old.token||'') ? old.token : undefined });
  const preferredPort=Number(process.env.BILI_PORT) || (Number.isInteger(old.port) && old.port>1023 && old.port<65536 ? old.port : 0);
  await new Promise((resolve,reject)=>{app.server.once('error',error=>{if(error.code==='EADDRINUSE')app.server.listen(0,'127.0.0.1',resolve);else reject(error);});app.server.listen(preferredPort,'127.0.0.1',resolve);});
  const port = app.server.address().port;
  void app.audit();
  fs.writeFileSync(runtime, JSON.stringify({ port, token: app.token, pid: process.pid }));
  app.server.on('close', () => { try { if (JSON.parse(fs.readFileSync(runtime, 'utf8')).token === app.token) fs.writeFileSync(runtime,JSON.stringify({port,token:app.token,pid:null})); } catch {} });
  const address = `http://127.0.0.1:${port}/?token=${app.token}`;
  console.log('Painel local iniciado em http://127.0.0.1:' + port);
  if (!process.argv.includes('--no-open')) spawn('cmd.exe', ['/c', 'start', '', address], { windowsHide: true, stdio: 'ignore' }).unref();
  let closing = false;
  async function close() { if (closing) return; closing = true; await app.pause(); app.persist(true); app.server.close(); process.exit(0); }
  process.on('SIGINT', close); process.on('SIGTERM', close);
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { createApp, buildArgs, recoverDownload };
