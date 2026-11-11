const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {organizeLibraries,titleStem,captionBase}=require('../library-files.cjs');
const {safeName}=require('../library.cjs');
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bili-files-')),root=path.join(dir,'playlist'),data=path.join(dir,'profile');fs.mkdirSync(root);fs.mkdirSync(data);
 t.after(()=>{const resolved=fs.realpathSync(dir);assert.ok(resolved.startsWith(fs.realpathSync(os.tmpdir())+path.sep));assert.match(path.basename(resolved),/^bili-files-/);fs.rmSync(resolved,{recursive:true,force:true});});
 const write=(name,text='video')=>{const p=path.join(root,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,text);return p;};
 const source=write('001 - episode.mp4'),output=write('Videos-unidos-2.mp4','merged-video'),srt=write('Videos-unidos-2.pt-BR.srt','1\n00:00:00,000 --> 00:00:02,000\nOlá.\n');
 const item={id:'export-a',type:'merged',status:'done',title:'Aula: Desenho / A? · 2 episódios',output,sourceIds:['a'],subtitles:{language:'pt',srt,vtt:write('Videos-unidos-2.pt-BR.vtt','WEBVTT\n'),original:{language:'zh',srt:write('Legendas originais/Videos-unidos-2.whisper.srt','你好')}}};
 const job={id:'a',target:root,status:'done',output:source};const state={jobs:[job],exports:[item],busy:false,linkQueue:[]};
 write('Videos-unidos-2.srt.before-readable-123','old subtitle');write('Videos-unidos-2.pt-BR.progress.json','{"translated":[]}');write('anotações do aluno.txt','personal');
 return{dir,root,data,write,state,item,job,source,output,srt};
}
test('organização preserva bytes e referências e deixa só MP4 e SRT ao lado',t=>{
 const f=fixture(t),before=fs.readFileSync(f.output),original=fs.readFileSync(f.source);const result=organizeLibraries(f.state,f.data);
 assert.deepEqual(result.warnings,[]);assert.ok(result.moved>=7);assert.deepEqual(fs.readFileSync(f.item.output),before);assert.deepEqual(fs.readFileSync(f.job.output),original);
 assert.equal(path.basename(f.item.output),'Aula_ Desenho _ A_.mp4');assert.equal(path.dirname(f.job.output),path.join(f.root,'Episódios'));
 assert.equal(path.basename(f.item.subtitles.playbackSrt),'Aula_ Desenho _ A_.srt');assert.match(fs.readFileSync(f.item.subtitles.playbackSrt,'utf8'),/Olá/);
 assert.ok(f.item.subtitles.srt.includes('Arquivos de apoio'));assert.ok(f.item.subtitles.original.srt.includes('Arquivos de apoio'));assert.ok(fs.existsSync(f.item.translationCheckpointFile));assert.equal(captionBase(f.item)+'.progress.json',f.item.translationCheckpointFile);
 assert.deepEqual(fs.readdirSync(f.root).filter(n=>fs.statSync(path.join(f.root,n)).isFile()).sort(),['Aula_ Desenho _ A_.mp4','Aula_ Desenho _ A_.srt','anotações do aluno.txt'].sort());
 const snapshot=JSON.stringify(f.state);assert.equal(organizeLibraries(f.state,f.data).moved,0);assert.equal(JSON.stringify(f.state),snapshot);
});
test('interrupção após renomear recupera os caminhos pelo diário',t=>{
 const f=fixture(t),saved=structuredClone(f.state);
 assert.throws(()=>organizeLibraries(f.state,f.data,{persist(){throw Error('simulated interruption');}}));
 const result=organizeLibraries(saved,f.data);assert.deepEqual(result.warnings,[]);assert.ok(fs.existsSync(saved.exports[0].output));assert.ok(fs.existsSync(saved.jobs[0].output));assert.ok(fs.existsSync(saved.exports[0].subtitles.srt));
 assert.ok(!fs.readdirSync(f.root).some(n=>n.startsWith('Videos-unidos')));
});
test('não organiza durante trabalho ativo e não expõe mandarim quando PT falhou',t=>{
 const f=fixture(t);f.state.operation={status:'running'};assert.equal(organizeLibraries(f.state,f.data).skipped,true);assert.ok(fs.existsSync(f.output));
 f.state.operation.status='error';f.item.subtitles.language='zh';f.item.subtitleDelivery={requestedLanguage:'pt',status:'error'};
 organizeLibraries(f.state,f.data);assert.equal(fs.existsSync(f.item.output.replace('.mp4','.srt')),false);assert.ok(fs.existsSync(f.item.subtitles.srt));
});
test('colisões e versões anteriores são preservadas sem sobrescrita',t=>{
 const f=fixture(t),target=f.write('Aula_ Desenho _ A_.mp4','foreign file');organizeLibraries(f.state,f.data);assert.equal(fs.readFileSync(target,'utf8'),'foreign file');assert.match(f.item.output,/\(2\)\.mp4$/);assert.equal(organizeLibraries(f.state,f.data).moved,0);
 const newer={...f.item,id:'export-b',output:f.write('newer.mp4','new version'),fileOrganization:undefined};f.state.exports.push(newer);organizeLibraries(f.state,f.data);
 assert.ok(f.item.output.includes('Versões anteriores'));assert.equal(fs.readFileSync(f.item.output,'utf8'),'merged-video');assert.equal(fs.readFileSync(newer.output,'utf8'),'new version');assert.equal(fs.readFileSync(target,'utf8'),'foreign file');
});
test('nomes Windows escapam caracteres, dispositivos e pares Unicode cortados',()=>{
 for(const n of ['CON','nul.txt','COM¹','LPT².txt'])assert.match(safeName(n),/^_/);
 assert.equal(safeName('  Nome: a/b?*<>|"\\.  '),'Nome_ a_b_______');
 assert.equal(safeName('ab😀',3),'ab');assert.ok(!/[<>:"/\\|?*\x00-\x1f]$/.test(titleStem('C:\\Videos','a:b/c?')));
 assert.equal(titleStem(path.join('C:/Videos','x'.repeat(125)),'Árvore '.repeat(100)).endsWith(' '),false);
});
test('diário inválido é informado sem impedir a abertura nem tocar em arquivos externos',t=>{
 const f=fixture(t),external=path.join(f.dir,'outside.txt');fs.writeFileSync(external,'untouched');
 fs.writeFileSync(path.join(f.data,'library-files-journal.json'),JSON.stringify({version:1,moves:[{root:f.root,from:external,to:path.join(f.root,'outside.txt')}]}));
 assert.ok(organizeLibraries(f.state,f.data).warnings.length);assert.equal(fs.readFileSync(external,'utf8'),'untouched');
 fs.writeFileSync(path.join(f.data,'library-files-journal.json'),'{truncated');assert.equal(organizeLibraries(f.state,f.data).moved,0);
});
test('resultados antigos gerados pelo programa também são guardados quando saíram do histórico',t=>{
 const f=fixture(t),name='Videos-unidos-23-episodios-20261107-214032';f.write(name+'.mp4','old merged');f.write(name+'.whisper-1.pt-BR.srt','old subtitle');
 organizeLibraries(f.state,f.data);assert.equal(fs.readFileSync(path.join(f.root,'Arquivos de apoio','Versões anteriores',name+'.mp4'),'utf8'),'old merged');
 assert.equal(fs.readFileSync(path.join(f.root,'Arquivos de apoio',name+'.whisper-1.pt-BR.srt'),'utf8'),'old subtitle');assert.ok(!fs.readdirSync(f.root).some(n=>n.startsWith('Videos-unidos')));
});
