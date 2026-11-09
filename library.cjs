const fs = require('node:fs');
const { URL } = require('node:url');
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36', Referer: 'https://www.bilibili.com/' };
function normalizeUrl(value) {
  value=String(value).trim().replaceAll('&amp;','&');
  if (/^(?:BV[0-9A-Za-z]{10}|av\d+)$/.test(value)) value='https://www.bilibili.com/video/'+value+'/';
  let url;
  try { url = new URL(value); } catch { throw new Error('Cole um link ou identificador BV/AV do Bilibili.'); }
  if (url.protocol !== 'https:' || !['www.bilibili.com', 'bilibili.com', 'm.bilibili.com','space.bilibili.com','t.bilibili.com','b23.tv','player.bilibili.com'].includes(url.hostname) || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Use um link HTTPS do Bilibili ou b23.tv.');
  if(url.hostname==='player.bilibili.com' && url.pathname==='/player.html')return normalizeUrl(url.searchParams.get('bvid')||('av'+url.searchParams.get('aid')));
  if(url.hostname==='b23.tv' && /^\/[\w-]+\/?$/.test(url.pathname))return 'https://b23.tv'+url.pathname.replace(/\/$/,'');
  if(url.hostname==='t.bilibili.com' && /^\/\d+\/?$/.test(url.pathname))return 'https://t.bilibili.com'+url.pathname.replace(/\/$/,'');
  if(url.hostname==='space.bilibili.com'){
    if(/^\/\d+(?:\/(?:video|upload\/video|channel\/collectiondetail|channel\/seriesdetail|lists(?:\/\d+)?|favlist))?\/?$/.test(url.pathname)){
      const clean=new URL('https://space.bilibili.com'+url.pathname.replace(/\/$/,''));
      for(const key of ['sid','season_id','series_id','fid','type'])if(url.searchParams.has(key))clean.searchParams.set(key,url.searchParams.get(key));
      return clean.href;
    }
    throw Error('Cole o endereço da coleção, série, favoritos ou vídeos do autor.');
  }
  const episodic=url.pathname.match(/^\/(bangumi\/(?:play\/(?:ep|ss)\d+|media\/md\d+)|cheese\/play\/(?:ep|ss)\d+)\/?$/);
  if(episodic)return 'https://www.bilibili.com/'+episodic[1]+'/';
  if(/^\/audio\/(?:au|am)\d+\/?$/.test(url.pathname))throw Error('Este link contém somente áudio. O Bili Studio trabalha com vídeos gravados que possuem vídeo e áudio.');
  if(/^\/(?:medialist\/(?:play\/\w+|detail\/ml\d+)|list\/\w+)\/?$/.test(url.pathname)){
    const clean=new URL('https://www.bilibili.com'+url.pathname);for(const k of ['business','business_id','sid','oid','type'])if(url.searchParams.has(k))clean.searchParams.set(k,url.searchParams.get(k));return clean.href;
  }
  // BCP 47 includes script subtags (zh-Hans), regions (pt-BR, es-419)
  // and their combinations. They all identify the same original video.
  const match = url.pathname.match(/^\/(?:([^/]+)\/)?video\/(BV[0-9A-Za-z]{10}|av\d+)\/?$/);
  let validLocale = true;
  if (match?.[1]) { try { Intl.getCanonicalLocales(match[1]); } catch { validLocale = false; } }
  const id = validLocale ? match?.[2] : null;
  if (!id) throw new Error('Use o endereço de um vídeo dentro da playlist: bilibili.com/video/BV…');
  return 'https://www.bilibili.com/video/' + id + '/';
}
function cookieHeader(file) {
  if (!file) return '';
  if (!fs.existsSync(file)) throw new Error('Arquivo de cookies não encontrado. Escolha novamente.');
  if (fs.statSync(file).size > 2 * 1024 * 1024) throw new Error('Arquivo de cookies muito grande. Use o formato Netscape.');
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).map(line => line.replace(/^#HttpOnly_/, '')).filter(line => line && !line.startsWith('#')).map(line => line.split('\t')).filter(p => p.length >= 7 && /(^|\.)bilibili\.com$/.test(p[0].replace(/^\./, '')) && (!Number(p[4]) || Number(p[4]) > Date.now() / 1000)).map(p => p[5] + '=' + p[6]).join('; ');
}
function initialState(html) {
  const marker = /window\.__INITIAL_STATE__\s*=\s*/g.exec(html);
  if (!marker) throw new Error('O Bilibili não enviou a lista de vídeos. Abra o link no navegador e tente novamente; se houver login, use cookies nas opções.');
  const start = marker.index + marker[0].length;
  // Scan balanced JSON rather than evaluating page JavaScript or assuming a semicolon delimiter.
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (quoted) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') quoted = false; }
    else if (ch === '"') quoted = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') { if (--depth === 0) return JSON.parse(html.slice(start, i + 1)); }
  }
  throw new Error('A página veio incompleta. Tente analisar novamente.');
}
function makeLibrary(video, url) {
  if (!video || !video.bvid || !Array.isArray(video.pages) || !video.pages.length) throw new Error('Vídeo indisponível ou requer login.');
  const season = video.ugc_season;
  const entries = [], seen = new Set();
  function add(bvid, p, title, duration, section = '') {
    if (!/^BV[0-9A-Za-z]{10}$/.test(bvid)) return;
    const id = `${bvid}:${p}`;
    if (seen.has(id)) return;
    seen.add(id);
    entries.push({ id, bvid, page: p, index: entries.length + 1, title: String(title || bvid), duration: Number(duration) || 0, section, url: `https://www.bilibili.com/video/${bvid}/?p=${p}` });
  }
  if (season?.sections?.some(s => s.episodes?.length)) {
    for (const section of season.sections) for (const ep of section.episodes || []) {
      // Collection entries may have multiple pages; expand the known pages without duplicating them.
      const pages = ep.pages?.length ? ep.pages : (ep.page ? [ep.page] : [{ page: 1, part: ep.title, duration: ep.arc?.duration }]);
      for (const p of pages) add(ep.bvid || ep.arc?.bvid, Number(p.page) || 1, pages.length > 1 ? `${ep.title} — ${p.part}` : ep.title || p.part, p.duration ?? ep.arc?.duration, section.title || '');
    }
  } else for (const p of video.pages) add(video.bvid, Number(p.page) || 1, p.part || video.title, p.duration);
  if (!entries.length) throw new Error('Nenhum episódio disponível nesta página.');
  return { id: season ? `season-${season.id}` : video.bvid, title: season?.title || video.title, author: video.owner?.name || '', source: url, kind: season ? 'Coleção' : entries.length > 1 ? 'Playlist de partes' : 'Vídeo', entries, duration: entries.reduce((sum, e) => sum + e.duration, 0) };
}
async function discover(value, cookieFile = '', request = fetch, options={}) {
  let url = normalizeUrl(value);
  const cookie = cookieHeader(cookieFile);
  if(new URL(url).hostname==='b23.tv')url=await resolveShortLink(url,request);
  if (/\/video\//.test(url)) {
    try {
      const response = await request(url, { headers: { ...HEADERS, ...(cookie ? { Cookie: cookie } : {}) }, redirect: 'error', signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`O Bilibili recusou a consulta (HTTP ${response.status}). Abra o link no navegador e tente novamente. Você pode informar cookies da sua sessão nas opções.`);
      return makeLibrary(initialState(await response.text()).videoData, url);
    } catch(error) { if(request!==fetch || options.noFallback)throw error; }
  }
  const extract=options.extract||extractLibrary;
  return makeExtractedLibrary(await extract(url,cookieFile),url);
}
async function resolveShortLink(value,request=fetch){
  let url=normalizeUrl(value);
  for(let n=0;n<5;n++){
    if(new URL(url).hostname!=='b23.tv')return url;
    const r=await request(url,{redirect:'manual',headers:HEADERS,signal:AbortSignal.timeout(30000)});
    await r.body?.cancel();
    if(![301,302,303,307,308].includes(r.status)||!r.headers.get('location'))throw Error('O link b23.tv não redirecionou para um vídeo.');
    url=normalizeUrl(new URL(r.headers.get('location'),url).href);
  }
  throw Error('O link curto possui redirecionamentos demais.');
}
async function extractLibrary(url,cookieFile){
  const {execute}=require('./media.cjs'),path=require('node:path');
  const args=['--ignore-config','--flat-playlist','--dump-single-json','--skip-download','--yes-playlist','--playlist-end','1001','--socket-timeout','20','--retries','2','--encoding','utf-8'];
  if(cookieFile)args.push('--cookies',cookieFile);
  const {stdout}=await execute(path.join(require('./runtime-paths.cjs').BIN_DIR,'yt-dlp.exe'),[...args,'--',url]);
  try{return JSON.parse(stdout);}catch{throw Error('A lista recebida está incompleta ou grande demais. Divida a biblioteca em coleções menores.');}
}
function makeExtractedLibrary(info,url){
  if(info.is_live||info.live_status==='is_live')throw Error('Transmissões ao vivo em andamento não são aceitas. Use um vídeo gravado.');
  const flat=[];
  function visit(item){if(!item)return;if(Array.isArray(item.entries))for(const child of item.entries)visit(child);else flat.push(item);}
  visit(info);
  if(flat.length>1000 || Number(info.playlist_count)>1000)throw Error('Esta lista tem mais de 1.000 vídeos. Divida em coleções menores para conferir a seleção.');
  const entries=[],seen=new Set();
  for(const item of flat){
    if(item.is_live||item.live_status==='is_live')throw Error('A lista contém uma transmissão ao vivo. Use uma coleção de vídeos gravados.');
    const raw=item.webpage_url||item.url||(/^BV[0-9A-Za-z]{10}$/.test(item.id||'')?'https://www.bilibili.com/video/'+item.id+'/':'');
    if(!raw)throw Error('Há um episódio sem endereço na lista. Não é seguro ignorá-lo; tente o link direto.');
    const parsed=new URL(raw),normalized=normalizeUrl(raw),p=Number(parsed.searchParams.get('p'))||1;
    const entryUrl=/\/video\//.test(normalized)?normalized+'?p='+p:normalized;
    if(seen.has(entryUrl))continue;seen.add(entryUrl);
    entries.push({id:'entry-'+require('node:crypto').createHash('sha256').update(entryUrl).digest('hex').slice(0,20),bvid:String(item.id||entries.length+1).replace(/[^\w-]/g,'_'),page:p,index:entries.length+1,title:String(item.title||item.id||'Episódio'),duration:Number(item.duration)||0,url:entryUrl});
  }
  if(!entries.length)throw Error('Nenhum vídeo foi disponibilizado. Verifique login, região e permissão de acesso.');
  return {id:'list-'+require('node:crypto').createHash('sha256').update(url).digest('hex').slice(0,16),title:String(info.title||entries[0].title),author:String(info.uploader||''),source:url,kind:entries.length>1?'Biblioteca':'Vídeo',entries,duration:entries.reduce((s,e)=>s+e.duration,0)};
}
function safeName(value, max = 85) {
  let name = String(value).normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').trim().slice(0, max).replace(/[. ]+$/, '');
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = '_' + name;
  return name || 'Bilibili';
}
module.exports = { normalizeUrl, initialState, makeLibrary, discover, safeName, cookieHeader,resolveShortLink,makeExtractedLibrary };
