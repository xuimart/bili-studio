'use strict';
const $ = id => document.getElementById(id);
let state, selected = new Set(), libraryKey='', rows=new Map(), action=false, polling=false, exportKey='', logKey='',queueKey='',queueRows=new Map(),disconnected=false;
const audioLanguages={auto:'detecção automática',en:'inglês fixo',zh:'mandarim fixo',pt:'português fixo',es:'espanhol fixo',fr:'francês fixo',ja:'japonês fixo',de:'alemão fixo',it:'italiano fixo',ko:'coreano fixo'};
const labels={done:'Pronto · com áudio',queued:'Na fila',paused:'Pausado',error:'Precisa de atenção',downloading:'Baixando',merging:'Reunindo vídeo + áudio',checking:'Conferindo áudio'};
const setText=(id,value)=>{if($(id).textContent!==String(value))$(id).textContent=value;};
function duration(n){n=Math.round(n||0);return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');}
function notify(message,error=false){setText('notice',message);$('notice').hidden=false;$('notice').className='notice'+(error?' error':'');}
async function api(route,body){const r=await fetch('/api/'+route,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error||'Não foi possível concluir.');return data;}
function settings(){return{folder:$('folder').value.trim(),quality:$('quality').value,cookieFile:$('cookies').value.trim()};}
function processing(){return{merge:$('with-merge').checked,subtitles:$('with-subtitles').checked,language:$('source-language').value,subtitleLanguage:$('subtitle-language').value};}
function job(id){return [...(state?.jobs||[])].reverse().find(j=>j.id===id||j.entryId===id)||state?.exports.find(j=>j.id===id);}
function locked(){return disconnected||action||state?.auditing;}
function selection(){
 const entries=state?.library?.entries||[], count=entries.filter(e=>selected.has(e.id)).length, p=processing(), lock=locked(), queued=(state?.linkQueue||[]).filter(q=>['pending','paused'].includes(q.status)).length;
 setText('selected-count',count+' selecionados');$('select-all').checked=!!entries.length&&count===entries.length;$('select-all').indeterminate=count>0&&count<entries.length;
 for(const id of ['url','folder','quality','cookies','choose-folder','choose-cookies','analyze','select-all','select-ready','with-merge','with-subtitles'])$(id).disabled=lock;
 $('source-language').disabled=lock||!p.subtitles;$('subtitle-language').disabled=lock||!p.subtitles;$('subtitle-options').classList.toggle('disabled',!p.subtitles);
 for(const [id,row] of rows){row.check.checked=selected.has(id);row.check.disabled=lock;}
 $('start').disabled=lock||state?.busy||state?.queueEnabled||state?.linkQueue?.some(q=>q.status==='running')||state?.operation?.status==='running'||(!queued&&(!count||(p.merge&&count<2)));
 $('queue-add-selection').disabled=lock||!count;
 $('queue-add-links').disabled=lock||!$('queue-urls').value.trim();
 $('queue-start').disabled=lock||!(state?.linkQueue||[]).some(q=>['pending','paused'].includes(q.status));
 $('queue-start').hidden=!!state?.queueEnabled; $('queue-pause').hidden=!state?.queueEnabled;$('queue-pause').disabled=action||disconnected;
 for(const b of document.querySelectorAll('#link-queue-items button, #link-history-items button'))b.disabled=action||disconnected;
 const allDone=count&&entries.filter(e=>selected.has(e.id)).every(e=>job(e.id)?.status==='done');
 setText('start',state?.queueEnabled?'Fila em andamento':state?.busy?'Baixando…':state?.operation?.status==='running'?'Processando…':state?.auditing?'Verificando arquivos…':queued?'Iniciar fila de '+queued+' links':allDone&&(p.merge||p.subtitles)?'Processar esta seleção ('+count+' vídeos)':'Baixar esta seleção ('+count+' vídeos)');
 setText('queue-start',state?.queueEnabled?'Fila em andamento':'Iniciar fila de '+queued+' links');
 setText('merge-description',p.merge?'Ligado: cria um MP4 com capítulos e mantém os episódios individuais.':'Desligado: cada episódio fica em seu próprio MP4.');
 setText('plan-summary',queued?'Fila: '+queued+' links aguardando. Cada um será processado com suas opções salvas.':!count?'Selecione os vídeos para começar.':count+' vídeos → '+(p.merge?'1 MP4 unido':'MP4 separados')+' → '+(p.subtitles?(p.subtitleLanguage==='pt'?'legenda em português':'legenda no idioma original'):'sem gerar legendas')+'.');
 setText('run-help',state?.busy||state?.operation?.status==='running'?'Você pode preparar outro link e adicionar à fila enquanto este termina.':queued?'Iniciar fila executa os links já adicionados. Para incluir esta seleção, use o botão Adicionar seleção à fila.':lock?'Aguarde a verificação dos arquivos.':p.merge&&count<2?'Selecione pelo menos 2 vídeos para juntar.':p.merge&&p.subtitles?'Depois de baixar, o painel junta os vídeos e legenda o arquivo final.':'As opções acima serão executadas automaticamente.');
}
function preview(item){
 const player=$('player');player.pause();player.replaceChildren();player.src='/api/media?id='+encodeURIComponent(item.id);player.muted=false;player.volume=1;
 if(item.subtitles){const track=document.createElement('track');track.kind='subtitles';track.label=item.subtitles.language==='pt'?'Português':'Legenda';track.srclang=item.subtitles.language==='auto'?'en':item.subtitles.language;track.src='/api/subtitle?id='+encodeURIComponent(item.id)+'&format=vtt';track.default=true;player.append(track);}
 setText('preview-title',item.title);$('download-current').href=player.src+'&download=1';$('download-srt').hidden=!item.subtitles;$('download-srt').href='/api/subtitle?id='+encodeURIComponent(item.id)+'&format=srt&download=1';player.load();$('preview-dialog').showModal();
}
function render(next,first=false){
 const finished=state&&((state.operation?.status==='running'&&next.operation?.status==='done')||(state.workflow?.status==='downloading'&&next.workflow?.status==='done')||(state.linkQueue||[]).some(q=>q.status==='running'&&next.linkQueue?.find(n=>n.id===q.id)?.status==='done'));
 if(finished)notify('Pronto. Os arquivos estão na pasta escolhida e em Histórico e arquivos prontos.');
 state=next;setText('connection','● Neste computador');$('save-warning').hidden=!state.persistenceWarning;if(state.persistenceWarning)setText('save-warning',state.persistenceWarning);
 if(first){$('url').value=state.url;$('folder').value=state.folder;$('quality').value=state.quality;$('cookies').value=state.cookieFile||'';const p=state.processingPrefs||{};$('with-subtitles').checked=p.subtitles??true;$('with-merge').checked=p.merge??false;$('source-language').value=p.language||'auto';$('subtitle-language').value=p.subtitleLanguage||'pt';}
 const entries=state.library?.entries||[], key=JSON.stringify(entries.map(e=>[e.id,e.title]));
 if(key!==libraryKey){libraryKey=key;selected=new Set(entries.map(e=>e.id));rows.clear();$('episodes').replaceChildren();
 for(const e of entries){const root=document.createElement('article');root.className='episode';const check=document.createElement('input');check.type='checkbox';check.setAttribute('aria-label','Selecionar vídeo '+e.index);check.addEventListener('change',()=>{check.checked?selected.add(e.id):selected.delete(e.id);selection();});
 const number=document.createElement('span');number.className='episode-number';number.textContent=String(e.index).padStart(2,'0');const img=document.createElement('img');img.className='thumb';img.alt='';img.hidden=true;img.loading='lazy';
 const info=document.createElement('div');info.className='episode-info';const name=document.createElement('strong');name.textContent=e.title;const status=document.createElement('small');info.append(name,status);
 const button=document.createElement('button');button.className='preview-button';button.textContent='Prévia';button.setAttribute('aria-label','Prévia do vídeo '+e.index);button.onclick=()=>preview(job(e.id));root.append(check,number,img,info,button);$('episodes').append(root);rows.set(e.id,{check,img,status,button});}}
 for(const e of entries){const r=rows.get(e.id),j=job(e.id);r.status.textContent=duration(e.duration)+' · '+(labels[j?.status]||'Disponível');r.status.className=j?.status||'';r.status.title=j?.error||'';r.button.hidden=j?.status!=='done';if(j?.thumbnail&&r.img.hidden){r.img.src='/api/thumbnail?id='+encodeURIComponent(j.id);r.img.hidden=false;}}
 setText('episode-count',entries.length+' vídeos');setText('collection-name',state.library?.title||'Os vídeos aparecem aqui depois de buscar o link.');$('episodes-empty').hidden=!!entries.length;selection();renderLinkQueue();
 const current=state.jobs.find(j=>['downloading','merging','checking'].includes(j.status)),op=state.operation, running=op?.status==='running',flow=state.workflow;
 const showProgress=state.busy||running||['downloading','processing','blocked'].includes(flow?.status)||op?.status==='error';$('processing-panel').hidden=!showProgress;$('stage-status').hidden=!showProgress;
 const stageNames={merge:'2. União dos vídeos',transcribe:'3. Transcrição com Whisper',translate:'4. Tradução para português'};
 setText('stage-status',running?(stageNames[op.stage]||'Preparando')+' · '+Math.round(op.stageProgress||0)+'% desta etapa · painel conectado'+(op.updatedAt?' · atualização há '+Math.max(0,Math.floor((Date.now()-Date.parse(op.updatedAt))/1000))+' s':''):flow?.status==='done'?'Processamento concluído. Use os links de MP4 e legenda SRT acima.':'');
 $('pause').hidden=!state.busy;$('pause').disabled=action;$('cancel-operation').hidden=!running;$('cancel-operation').disabled=action;
 setText('queue-label',running?'PROCESSANDO ARQUIVOS':state.busy?'BAIXANDO VÍDEOS':flow?.status==='done'?'CONCLUÍDO':'ACOMPANHAMENTO');
 setText('current-title',running?op.phase:current?String(current.index).padStart(2,'0')+' · '+current.title:op?.status==='error'?op.phase:flow?.status==='done'?'Última execução concluída: '+flow.ids.length+' vídeos.':state.summary.failed?'Há vídeos com erro. Selecione e retome.':'Escolha as opções acima e inicie quando quiser.');
 const flowJobs=flow?.ids?state.jobs.filter(j=>flow.ids.includes(j.id)&&j.target===flow.target):state.jobs, flowDone=flowJobs.filter(j=>j.status==='done').length;
 setText('queue-count',flowDone+' de '+flowJobs.length+' vídeos prontos');setText('speed',running?Math.round(op.progress||0)+'%':current?.speed?Math.round(current.speed/1024)+' KB/s · '+current.progress+'%':'');
 $('total-progress').value=running?op.progress||0:100*(flowDone+(current?.progress||0)/100)/Math.max(1,flowJobs.length);
 setText('workflow-description',flow&&['downloading','processing'].includes(flow.status)?'Esta execução: '+(flow.merge?'juntar em um MP4':'manter vídeos separados')+' · '+(flow.subtitles?(flow.subtitleLanguage==='pt'?'gerar legenda em português':'gerar legenda original'):'sem gerar legenda')+'.':flow?.status==='blocked'?'O processamento espera os vídeos com erro serem retomados.':'');
 const archivedResults=new Set((state.linkQueue||[]).filter(q=>q.status==='done').map(q=>q.resultId));
 const exports=(state.exports||[]).filter(e=>!archivedResults.has(e.id)),outKey=JSON.stringify(exports.map(e=>[e.id,e.subtitles?.createdAt]));if(outKey!==exportKey){exportKey=outKey;$('export-results').replaceChildren();for(const item of exports){const row=document.createElement('div');row.className='export-item';const label=document.createElement('span');label.textContent=item.sourceIds.length+' vídeos unidos · '+duration(item.duration)+(item.subtitles?' · com legenda':'');const button=document.createElement('button');button.className='text-button';button.textContent='Prévia';button.onclick=()=>preview(item);const link=document.createElement('a');link.textContent='Salvar MP4 ↗';link.href='/api/media?id='+encodeURIComponent(item.id)+'&download=1';row.append(label,button,link);if(item.subtitles){const sub=document.createElement('a');sub.textContent=item.subtitles.language==='pt'?'Legenda PT-BR ↓':'Legenda original ↓';sub.href='/api/subtitle?id='+encodeURIComponent(item.id)+'&format=srt&download=1';row.append(sub);}$('export-results').append(row);}}
 const lk=JSON.stringify(state.logs.at(-1));if(lk!==logKey){logKey=lk;$('logs').replaceChildren();for(const log of [...state.logs].reverse()){const line=document.createElement('div');line.textContent=new Date(log.time).toLocaleTimeString('pt-BR')+' · '+log.message;$('logs').append(line);}}
}

function renderLinkQueue(){
 const list=state.linkQueue||[],pending=list.filter(q=>['pending','paused'].includes(q.status)).length;
 const remaining=list.filter(q=>q.status!=='done'),completed=list.filter(q=>q.status==='done');
 setText('link-queue-count',pending+' aguardando');$('link-queue-empty').hidden=!!remaining.length;
 $('link-queue-panel').hidden=!remaining.length&&!$('bulk-links').open;
 const archiveIds=new Set(completed.map(q=>q.resultId)),historyCount=completed.length+(state.exports||[]).filter(e=>!archiveIds.has(e.id)).length;
 $('download-history').hidden=!historyCount;setText('history-count',historyCount+' resultados');
 setText('queue-help',state.queueEnabled?'A fila continua automaticamente: baixa, junta e legenda cada link antes de passar ao próximo.':list.some(q=>q.status==='running')?'O item atual vai terminar. Os próximos aguardam você iniciar a fila.':'Cada item guarda sua própria pasta e opções. A fila fica salva ao fechar o programa.');
 renderQueueNow();const key=JSON.stringify(list.map(q=>[q.id,q.status,q.title,q.error,q.jobIds,q.resultId,q.processing]));if(key===queueKey){updateQueueRows();return;}queueKey=key;queueRows.clear();$('link-queue-items').replaceChildren();$('link-history-items').replaceChildren();
 const status={pending:'Na fila',running:'Em andamento',paused:'Pausado',error:'Falhou · pode retomar',done:'Concluído'};
 for(const [index,q] of list.entries()){
  const row=document.createElement('article');row.className='queue-item '+q.status;
  const number=document.createElement('span');number.className='queue-number';number.textContent=String(index+1).padStart(2,'0');
  const info=document.createElement('div');info.className='queue-info';const title=document.createElement('strong');title.textContent=q.title;const badge=document.createElement('span');badge.className='queue-state';badge.textContent=status[q.status]||q.status;
  const meta=document.createElement('p');meta.className='help';meta.textContent=(q.ids?q.ids.length+' vídeos identificados':'Todos os vídeos · contagem ao abrir este link')+' · '+(q.processing.merge?'Unir por playlist':'Separados')+' · '+(q.processing.subtitles?(q.processing.subtitleLanguage==='pt'?'Legenda PT-BR':'Legenda original'):'Sem legenda')+(q.processing.subtitles?' · Áudio: '+(audioLanguages[q.processing.language]||q.processing.language):'');
  const folder=document.createElement('p');folder.className='help queue-path';folder.textContent=q.target||q.settings.folder;
  const live=document.createElement('p');live.className='queue-live';info.append(title,badge,meta,folder,live);queueRows.set(q.id,{live,badge});if(q.error){const error=document.createElement('p');error.className='feedback';error.textContent=q.error;info.append(error);}
  const actions=document.createElement('div');actions.className='queue-item-actions';
  if(q.status!=='running'){
   if(['error','paused'].includes(q.status)){const retry=document.createElement('button');retry.className='secondary';retry.textContent='Retomar';retry.onclick=()=>perform(async()=>render(await api('queue/retry',{id:q.id})));actions.append(retry);}
   const remove=document.createElement('button');remove.className='text-button';remove.textContent=q.status==='done'?'Tirar da lista':'Remover';remove.setAttribute('aria-label','Remover item '+(index+1)+' da fila');remove.onclick=()=>perform(async()=>render(await api('queue/remove',{id:q.id})));actions.append(remove);
  }
  row.append(number,info,actions);
  if(q.status==='done'){
   const files=document.createElement('details');files.className='queue-files';const summary=document.createElement('summary');summary.textContent='Arquivos prontos';files.append(summary);
   const items=q.resultId?[state.exports.find(e=>e.id===q.resultId)]:state.jobs.filter(j=>q.jobIds?.includes(j.id));
   for(const item of items.filter(Boolean)){const links=document.createElement('div');const a=document.createElement('a');a.textContent=item.title||'Salvar MP4';a.href='/api/media?id='+encodeURIComponent(item.id)+'&download=1';links.append(a);if(item.subtitles){const sub=document.createElement('a');sub.textContent='Legenda SRT ↓';sub.href='/api/subtitle?id='+encodeURIComponent(item.id)+'&format=srt&download=1';links.append(sub);}files.append(links);}row.append(files);
  }
  $(q.status==='done'?'link-history-items':'link-queue-items').append(row);
 }
 updateQueueRows();
}

function queueItemProgress(q){
 const flow=state.workflow, op=state.operation, ours=flow?.queueId===q.id, jobs=(state.jobs||[]).filter(j=>q.jobIds?.includes(j.id)),done=jobs.filter(j=>j.status==='done').length,current=jobs.find(j=>['downloading','merging','checking'].includes(j.status));
 if(q.status==='done')return{phase:'Concluído · arquivos prontos',progress:100};
 if(q.status==='error')return{phase:q.error||'Falha neste link',progress:0};
 if(q.status==='paused')return{phase:'Pausado · use Iniciar fila para retomar',progress:0};
 if(q.status!=='running')return{phase:q.library?'Pronto para iniciar na sua vez':'Aguardando sua vez para abrir a playlist',progress:0};
 if(!q.jobIds?.length||!ours)return{phase:'Abrindo o link e identificando todos os vídeos…',progress:null};
 if(op?.status==='running'){
  const stage={merge:'Unindo vídeos',transcribe:'Gerando legenda com Whisper',translate:'Traduzindo legenda para português'}[op.stage]||'Preparando arquivos';
  return{phase:stage+' · '+Math.round(op.stageProgress||0)+'% da etapa · '+op.phase,progress:Math.min(99,op.stageProgress||0)};
 }
 return{phase:'Baixando · '+done+' de '+jobs.length+' vídeos prontos'+(current?' · episódio '+current.index+' · '+(labels[current.status]||'Baixando')+' '+Math.round(current.progress||0)+'%'+(current.speed?' · '+(current.speed/1048576).toFixed(1)+' MB/s':'')+(current.transferMode==='parallel'?' · 4 conexões':''):''),progress:jobs.length?Math.min(99,100*(done+(current?.progress||0)/100)/jobs.length):null};
}
function updateQueueRows(){for(const q of state.linkQueue||[]){const row=queueRows.get(q.id);if(!row)continue;row.live.textContent=queueItemProgress(q).phase;}}
function renderQueueNow(){
 const list=(state.linkQueue||[]).filter(q=>q.status!=='done'),active=list.find(q=>q.status==='running'),waiting=list.filter(q=>['pending','paused'].includes(q.status)),done=list.filter(q=>q.status==='done').length,errors=list.filter(q=>q.status==='error').length;
 $('queue-now').hidden=!active&&!waiting.length; if($('queue-now').hidden)return;
 $('queue-now').classList.toggle('is-running',!!active&&!disconnected);
 setText('link-queue-count',waiting.length+' aguardando'+(active?' · 1 em andamento':'')+(errors?' · '+errors+' com erro':''));
 setText('queue-totals',waiting.length+' aguardando'+(errors?' · '+errors+' com erro':''));
 setText('queue-now-label',disconnected?'SEM CONEXÃO':active?'EM ANDAMENTO · LINK '+(list.indexOf(active)+1)+' DE '+list.length:waiting.length?'FILA AGUARDANDO INÍCIO':errors?'FILA ENCERRADA COM ERROS':'FILA CONCLUÍDA');
 setText('queue-now-title',active?active.title:waiting.length?waiting.length+' links prontos para iniciar':errors?'Confira os itens com erro abaixo.':'Todas as playlists foram processadas.');
 const detail=active?queueItemProgress(active):null;
 setText('queue-now-phase',disconnected?'Reconectando ao programa. O andamento não está sendo atualizado.':detail?detail.phase:waiting.length?'Clique em Iniciar fila. O painel faz uma playlist de cada vez.':'Os resultados estão em Arquivos prontos.');
 if(detail?.progress===null)$('queue-now-progress').removeAttribute('value');else $('queue-now-progress').value=detail?detail.progress:waiting.length?0:100;
 const next=waiting[0];setText('queue-now-next',active?(state.queueEnabled?'Continua automaticamente: baixar → unir → legendar → próximo link.':'Pausa programada após esta playlist.')+(next?' Próximo: '+next.title:' Último link da fila.'):'Cada link conserva sua pasta e suas opções de legenda e união.');
}
async function beginQueue(){notify('Iniciando a fila…');render(await api('queue/start',{}));$('notice').hidden=true;$('queue-now').scrollIntoView({behavior:'smooth',block:'center'});}

$('show-bulk-links').onclick=()=>{$('bulk-links').open=true;$('link-queue-panel').hidden=false;$('link-queue-panel').scrollIntoView({behavior:'smooth',block:'start'});$('queue-urls').focus({preventScroll:true});};
$('bulk-links').addEventListener('toggle',()=>{if(state)$('link-queue-panel').hidden=!(state.linkQueue||[]).some(q=>q.status!=='done')&&!$('bulk-links').open;});
$('queue-urls').addEventListener('input',selection);
$('queue-add-links').onclick=()=>perform(async()=>{const urls=$('queue-urls').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);render(await api('queue/add',{urls,...settings(),processing:processing()}));$('queue-urls').value='';notify('Links adicionados. Use Iniciar fila quando estiver pronto.');});
$('queue-add-selection').onclick=()=>perform(async()=>{render(await api('queue/add',{ids:[...selected],...settings(),processing:processing()}));notify('Seleção adicionada à fila com as opções atuais. Você já pode buscar outro link.');});
$('queue-start').onclick=()=>perform(beginQueue);
$('queue-pause').onclick=()=>perform(async()=>render(await api('queue/pause',{})));

async function perform(fn){if(action)return;action=true;if(state)selection();try{await fn();}catch(e){notify(e.message,true);}finally{action=false;if(state)render(state);}}
$('link-form').onsubmit=e=>{e.preventDefault();perform(async()=>{setText('import-feedback','Buscando vídeos…');try{render(await api('discover',{url:$('url').value,...settings()}));notify(state.library.entries.length+' vídeos encontrados. Escolha as opções e inicie.');}finally{setText('import-feedback','');}});};
for(const [id,route,input] of [['choose-cookies','choose-cookies','cookies']])$(id).onclick=()=>perform(async()=>{setText('settings-feedback','Escolha na janela do Windows.');try{const result=await api(route,{});if(result.path)$(input).value=result.path;}finally{setText('settings-feedback','');}});
let browsedFolder=null,folderLoading=false;
async function browseFolder(path){if(folderLoading)return;folderLoading=true;$('use-folder').disabled=true;setText('folder-error','Abrindo pasta…');try{const data=await api('browse-folders',{path});browsedFolder=data;$('folder-path').value=data.path;$('folder-list').replaceChildren();$('folder-drives').replaceChildren();for(const d of data.directories){const b=document.createElement('button');b.className='folder-entry';b.textContent='▸ '+d.name;b.onclick=()=>browseFolder(d.path);$('folder-list').append(b);}if(!data.directories.length){const p=document.createElement('p');p.className='help';p.textContent='Nenhuma subpasta. Você pode salvar aqui.';$('folder-list').append(p);}for(const drive of data.drives){const b=document.createElement('button');b.className='text-button';b.textContent=drive;b.onclick=()=>browseFolder(drive);$('folder-drives').append(b);}$('folder-up').disabled=data.parent===data.path;setText('folder-error','');}catch(e){browsedFolder=null;setText('folder-error',e.message);}finally{folderLoading=false;$('use-folder').disabled=!browsedFolder;}}
$('choose-folder').onclick=()=>{if(state?.desktop)return perform(async()=>{const r=await api('choose-folder',{});if(r.path)$('folder').value=r.path;});$('folder-dialog').showModal();browseFolder($('folder').value||state.folder);};$('close-folder').onclick=()=>$('folder-dialog').close();$('folder-nav').onsubmit=e=>{e.preventDefault();browseFolder($('folder-path').value);};$('folder-up').onclick=()=>{if(browsedFolder)browseFolder(browsedFolder.parent);};$('use-folder').onclick=()=>{if(browsedFolder){$('folder').value=browsedFolder.path;$('folder-dialog').close();}};
$('select-all').onchange=()=>{selected=$('select-all').checked?new Set(state.library.entries.map(e=>e.id)):new Set();selection();};$('select-ready').onclick=()=>{selected=new Set(state.library.entries.filter(e=>job(e.id)?.status==='done').map(e=>e.id));selection();};
for(const id of ['with-subtitles','with-merge','source-language','subtitle-language'])$(id).onchange=selection;
$('start').onclick=()=>perform(async()=>{if((state.linkQueue||[]).some(q=>['pending','paused'].includes(q.status)))return beginQueue();notify('Iniciando esta seleção…');render(await api('start',{ids:[...selected],...settings(),processing:processing()}));$('notice').hidden=true;document.querySelector('.progress-panel').scrollIntoView({behavior:'smooth',block:'center'});});
$('pause').onclick=()=>perform(async()=>{render(await api('pause',{}));notify('Downloads pausados. Use Iniciar fila para retomar os itens da fila.');});
$('cancel-operation').onclick=()=>perform(async()=>render(await api('cancel-operation',{})));
$('open-folder').onclick=()=>perform(()=>api('open-folder',{}));
$('close-preview').onclick=()=>$('preview-dialog').close();$('preview-dialog').addEventListener('close',()=>$('player').pause());$('sound-toggle').onclick=()=>{$('player').muted=false;$('player').volume=1;setText('sound-toggle','Som ligado');};
$('player').addEventListener('volumechange',()=>setText('sound-toggle',$('player').muted||!$('player').volume?'Ativar som':'Som ligado'));
async function poll(first=false){if(polling)return;polling=true;try{const next=await api('state');if(disconnected){$('notice').hidden=true;disconnected=false;}render(next,first);document.documentElement.dataset.ready="true";}catch(e){disconnected=true;setText('connection','Desconectado');notify('O painel perdeu a conexão com o programa. O percentual exibido não está sendo atualizado. Reabra o Bili Studio pelo atalho para reconectar.',true);if(state)selection();}finally{polling=false;}}poll(true);setInterval(()=>poll(),1400);
