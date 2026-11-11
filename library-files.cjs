const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {safeName} = require('./library.cjs');
const {subtitleDelivery} = require('./subtitle-delivery.cjs');

const SUPPORT = 'Arquivos de apoio', EPISODES = 'Episódios';
function titleStem(root, title) {
  // Leave room for extensions, temporary names and older Windows applications.
  return safeName(title, Math.max(16, Math.min(85, 225 - path.resolve(root).length)));
}
function mergedRoot(item, jobs = []) {
  return path.resolve(item.libraryRoot || jobs.find(j => item.sourceIds?.includes(j.id))?.target || path.dirname(item.output));
}
function captionBase(item) {
  if(item.translationCheckpointFile)return item.translationCheckpointFile.replace(/\.progress\.json$/,'');
  const root = item.libraryRoot || item.target || path.dirname(item.output);
  const dir = path.join(root, SUPPORT); fs.mkdirSync(dir, {recursive:true});
  const base=path.join(dir, safeName(path.basename(item.output, path.extname(item.output)), Math.max(16,Math.min(75,195-dir.length))) + '.pt-BR');
  item.translationCheckpointFile=base+'.progress.json';return base;
}
function replacePaths(value, from, to) {
  if (!value || typeof value !== 'object') return;
  for (const key of Object.keys(value)) {
    if (value[key] === from) value[key] = to;
    else if (typeof value[key] === 'object') replacePaths(value[key], from, to);
  }
}
function inside(root, file) {
  const relative = path.relative(root, file);
  return relative && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
}
function assertLocal(root, file) {
  if (!inside(root, file)) throw Error('Arquivo fora da pasta da playlist.');
  let part = root;
  if (fs.lstatSync(root).isSymbolicLink()) throw Error('Pasta da playlist é um link.');
  for (const name of path.relative(root, file).split(path.sep)) {
    part = path.join(part, name);
    if (fs.existsSync(part) && fs.lstatSync(part).isSymbolicLink()) throw Error('Link de arquivo não pode ser reorganizado.');
  }
}
function available(file) {
  if (!fs.existsSync(file)) return file;
  const ext = path.extname(file), base = file.slice(0, -ext.length || undefined);
  for (let i=2; ; i++) { const next = base + ` (${i})` + ext; if (!fs.existsSync(next)) return next; }
}
function supportTarget(root, file, section = '') {
  const dir = path.join(root, SUPPORT, section), name = path.basename(file);
  // Preserve the complete old name unless the full path would be too long.
  if (path.join(dir, name).length <= 240) return path.join(dir, name);
  const ext = path.extname(name).slice(0, 12);
  const hash = crypto.createHash('sha256').update(file).digest('hex').slice(0, 10);
  return path.join(dir, safeName(name, Math.max(20, 220-dir.length)) + '-' + hash + ext);
}

function organizeLibraries(state, dataDir, {persist = () => {}} = {}) {
  if (state.busy || state.auditing || state.queueEnabled || state.operation?.status === 'running') return {moved:0, skipped:true, warnings:[]};
  const journalFile = path.join(dataDir, 'library-files-journal.json');
  const result = {moved:0, warnings:[]};
  let journal = {version:1, moves:[]};
  try {
    if (fs.existsSync(journalFile)) journal = JSON.parse(fs.readFileSync(journalFile,'utf8'));
    if(journal.version!==1||!Array.isArray(journal.moves))throw Error('Formato de diário inválido.');
  }catch(error){result.warnings.push({file:journalFile,error:error.message});state.fileOrganization={version:1,warnings:result.warnings};persist();return result;}
  const saveJournal = () => { fs.mkdirSync(dataDir,{recursive:true}); fs.writeFileSync(journalFile+'.tmp',JSON.stringify(journal,null,2)); fs.renameSync(journalFile+'.tmp',journalFile); };
  // Reapply metadata after an interruption between a rename and state persistence.
  for (const move of journal.moves) {
    try {
    if (!fs.existsSync(move.root)) continue;
    assertLocal(move.root, move.from); assertLocal(move.root, move.to);
    if (!fs.existsSync(move.from) && fs.existsSync(move.to)) {
      const stat = fs.statSync(move.to);
      if (stat.size === move.size && Math.abs(stat.mtimeMs-move.mtimeMs)<1) replacePaths(state,move.from,move.to);
    }
    }catch(error){result.warnings.push({file:journalFile,error:error.message});}
  }
  function move(root, source, destination) {
    source=path.resolve(source); destination=path.resolve(destination);
    if (source===destination || !fs.existsSync(source)) return source;
    assertLocal(root,source); assertLocal(root,destination);
    if (!fs.lstatSync(source).isFile()) return source;
    destination=available(destination);
    const stat=fs.statSync(source), entry={root,from:source,to:destination,size:stat.size,mtimeMs:stat.mtimeMs};
    journal.moves.push(entry); saveJournal();
    try { fs.mkdirSync(path.dirname(destination),{recursive:true}); fs.renameSync(source,destination); }
    catch(error) { journal.moves.pop(); saveJournal(); result.warnings.push({file:source,error:error.message}); return source; }
    replacePaths(state,source,destination); result.moved++; return destination;
  }
  function moveTree(root, folder, section) {
    if (!fs.existsSync(folder)) return;
    assertLocal(root,folder);
    for (const entry of fs.readdirSync(folder,{withFileTypes:true})) {
      const file=path.join(folder,entry.name);
      if(entry.isSymbolicLink()) {result.warnings.push({file,error:'Link preservado sem alterações.'});continue;}
      if(entry.isDirectory()) moveTree(root,file,path.join(section,entry.name));
      else if(entry.isFile()) move(root,file,supportTarget(root,file,section));
    }
    try {fs.rmdirSync(folder);} catch {} // Empty only; never recursively delete.
  }
  const groups=new Map();
  for(const item of state.exports||[]) if(item.type==='merged'&&item.status==='done'&&item.output&&fs.existsSync(item.output)) {
    const root=mergedRoot(item,state.jobs); item.libraryRoot=root;
    item.playlistTitle ||= item.title.replace(/ · \d+ episódios$/u,'');
    if(!groups.has(root))groups.set(root,[]);groups.get(root).push(item);
  }
  const stateFile=path.join(dataDir,'state.json');
  if(groups.size&&!fs.existsSync(journalFile)&&fs.existsSync(stateFile))fs.copyFileSync(stateFile,stateFile+'.antes-organizacao-'+Date.now(),fs.constants.COPYFILE_EXCL);
  for(const [root,items] of groups) {
    try {
      const latest=items.at(-1), stem=titleStem(root,latest.playlistTitle), final=latest.fileOrganization?.finalOutput||path.join(root,stem+'.mp4');
      const allJobs=(state.jobs||[]).filter(j=>j.target&&path.resolve(j.target)===root);
      const oldStems=new Set(items.flatMap(i=>[path.basename(i.output,path.extname(i.output)),...(i.fileOrganization?.stems||[])]));
      // Early versions left assembled results which were no longer in the history.
      for(const name of fs.readdirSync(root))if(/^Videos-unidos-\d+-episodios-\d{8}-\d{6}\.mp4$/i.test(name))oldStems.add(name.slice(0,-4));
      for(const entry of journal.moves)if(entry.root===root&&path.dirname(entry.from)===root&&/\.mp4$/i.test(entry.from))oldStems.add(path.basename(entry.from,'.mp4'));
      if(!latest.translationCheckpointFile) {
        const checkpoints=fs.readdirSync(root).filter(n=>n.endsWith('.pt-BR.progress.json')&&[...oldStems].some(s=>n.startsWith(s+'.'))).map(n=>path.join(root,n));
        checkpoints.sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs);
        if(checkpoints.length)latest.translationCheckpointFile=checkpoints[0];
      }
      for(const job of allJobs) if(job.output)oldStems.add(path.basename(job.output,path.extname(job.output)));
      // Previous assembled versions stay recoverable but don't compete with the current result.
      for(const old of items.slice(0,-1)) if(path.dirname(old.output)===root) {
        const original=old.output, oldAlias=original.replace(/\.mp4$/i,'.srt');
        move(root,original,supportTarget(root,original,'Versões anteriores'));
        if(fs.existsSync(oldAlias))move(root,oldAlias,supportTarget(root,oldAlias,'Versões anteriores'));
      }
      // Do not displace a foreign file with the same name.
      const before=latest.output, newOutput=move(root,before,final);
      if(newOutput===before && path.resolve(before)!==path.resolve(final))continue;
      const alias=latest.output.replace(/\.mp4$/i,'.srt'), delivery=subtitleDelivery(latest,state);
      if(delivery.ready && latest.subtitles?.srt && fs.existsSync(latest.subtitles.srt)) {
        const source=latest.subtitles.srt;
        if(fs.existsSync(alias) && !fs.readFileSync(alias).equals(fs.readFileSync(source)))move(root,alias,supportTarget(root,alias,'Versões anteriores'));
        if(!fs.existsSync(alias))fs.copyFileSync(source,alias,fs.constants.COPYFILE_EXCL);
        latest.subtitles.playbackSrt=alias;
      }
      const keep=new Set([latest.output,delivery.ready?alias:null]);
      for(const job of allJobs) if(job.output&&fs.existsSync(job.output)&&path.dirname(job.output)===root) {
        const source=job.output, jobAlias=source.replace(/\.mp4$/i,'.srt');
        move(root,source,path.join(root,EPISODES,path.basename(source)));
        if(job.subtitles?.playbackSrt===jobAlias&&fs.existsSync(jobAlias))move(root,jobAlias,path.join(root,EPISODES,path.basename(jobAlias)));
      }
      for(const name of fs.readdirSync(root)) {
        const file=path.join(root,name);if(keep.has(file))continue;
        if(!fs.lstatSync(file).isFile())continue;
        if([...oldStems].some(s=>name.startsWith(s+'.')))move(root,file,supportTarget(root,file,/\.mp4$/i.test(name)?'Versões anteriores':''));
      }
      for(const folder of ['Dados da legenda','Legendas originais','.em-andamento'])moveTree(root,path.join(root,folder),folder);
      oldStems.add(path.basename(latest.output,path.extname(latest.output)));
      latest.fileOrganization={version:1,finalOutput:latest.output,stems:[...oldStems].sort(),organizedAt:latest.fileOrganization?.organizedAt||new Date().toISOString()};
      persist();
    } catch(error) {result.warnings.push({root,error:error.message});}
  }
  state.fileOrganization={version:1,warnings:result.warnings};persist();
  return result;
}
module.exports={organizeLibraries, titleStem, mergedRoot, captionBase, SUPPORT, EPISODES};
