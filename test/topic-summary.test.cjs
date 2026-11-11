const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {blocksFor,summaryCues,sample,validateLabel,generateSummary,clock}=require('../topic-summary.cjs');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bili-summary-'));t.after(()=>{const p=fs.realpathSync(dir);assert.ok(p.startsWith(fs.realpathSync(os.tmpdir())+path.sep));assert.match(path.basename(p),/^bili-summary-/);fs.rmSync(p,{recursive:true,force:true});});const srt=path.join(dir,'a.srt');fs.writeFileSync(srt,'1\n00:00:02,000 --> 00:00:06,000\nConstruímos a cabeça com formas simples.\n\n2\n00:08:05,000 --> 00:08:09,000\nA perspectiva muda a posição dos olhos.\n');return{dir,item:{id:'export-test',type:'merged',title:'Aula de desenho',libraryRoot:dir,subtitles:{language:'pt',srt},output:path.join(dir,'video.mp4')}};}
const label=b=>({title:'Construção do desenho',description:'Explica formas e proporções com base na aula.',evidenceId:b.cues[0].id,evidenceQuote:b.cues[0].text.slice(0,120)});
test('tempos são derivados da fonte, respeitam capítulos e não cruzam silêncio longo',()=>{
 const cues=[{start:2,end:5,text:'a'},{start:20,end:30,text:'b'},{start:31,end:35,text:'c'},{start:500,end:505,text:'d'}];
 const blocks=blocksFor(cues,600,[{start_time:'31'}]);assert.deepEqual(blocks.map(b=>[b.start,b.end]),[[2,30],[31,35],[500,505]]);assert.equal(clock(3603),'01:00:03');
 assert.throws(()=>blocksFor([{start:0,end:900,text:'a'}],600));assert.throws(()=>blocksFor([...cues].reverse(),600));assert.throws(()=>blocksFor([],600));
});
test('amostra limitada cobre início e fim; rejeita referência inventada, chinês e JSON inválido',()=>{
 const block={cues:Array.from({length:100},(_,i)=>({id:i+1,text:'proporção '.repeat(100)}))};const s=sample(block);assert.equal(s[0].id,1);assert.equal(s.at(-1).id,100);assert.ok(s.reduce((n,c)=>n+c.text.length,0)<=4200);
 for(const value of [{...label(block),evidenceId:999},{...label(block),title:'中文解释'},{...label(block),evidenceQuote:'Frase que não existe na fonte.'},{title:'A'}])assert.throws(()=>validateLabel(value,block));
});
test('salva sumário fora da raiz e reaproveita o checkpoint sem chamar o modelo',async t=>{
 const f=fixture(t);let calls=0;const first=await generateSummary(f.item,{duration:600,generate:async b=>{calls++;return label(b);}});assert.equal(calls,2);assert.equal(first.topics.length,2);assert.ok(first.markdown.includes('Arquivos de apoio'));assert.match(fs.readFileSync(first.markdown,'utf8'),/00:08:05/);assert.equal(fs.existsSync(path.join(f.dir,'Sumário.md')),false);
 const resumed=await generateSummary(f.item,{duration:600,generate:async()=>{throw Error('não deve executar');}});assert.equal(resumed.fingerprint,first.fingerprint);
});
test('falha e cancelamento preservam progresso e invalidam cache quando a legenda muda',async t=>{
 const f=fixture(t);let count=0;await assert.rejects(generateSummary(f.item,{duration:600,generate:async b=>{if(++count===2)throw Error('falha do modelo');return label(b);}}),/falha do modelo/);
 let resumed=0;await generateSummary(f.item,{duration:600,generate:async b=>{resumed++;return label(b);}});assert.equal(resumed,1);
 fs.appendFileSync(f.item.subtitles.srt,'\n3\n00:09:00,000 --> 00:09:05,000\nPlano da mandíbula.\n');let changed=0;await generateSummary(f.item,{duration:600,generate:async b=>{changed++;return label(b);}});assert.ok(changed>=2);
 const controller=new AbortController();controller.abort();fs.appendFileSync(f.item.subtitles.srt,'\n4\n00:09:30,000 --> 00:09:35,000\nContinuação.\n');await assert.rejects(generateSummary(f.item,{duration:600,signal:controller.signal,generate:async b=>label(b)}));
});
test('checkpoint com um assunto inválido reaproveita os demais assuntos válidos',async t=>{
 const f=fixture(t),result=await generateSummary(f.item,{duration:600,generate:async b=>label(b)}),file=result.json.replace('.json','.progress.json'),cache=JSON.parse(fs.readFileSync(file));cache.labels[0].description='8 palavras';fs.writeFileSync(file,JSON.stringify(cache));let calls=0;
 const fixed=await generateSummary(f.item,{duration:600,generate:async b=>{calls++;return label(b);}});assert.equal(calls,1);assert.equal(fixed.topics.length,2);
});
test('leitura para sumário limita pequena sobra no fim e registra trechos instantâneos sem mudar a legenda',()=>{
 const source=[{start:1,end:1,text:'instantâneo'},{start:2,end:5,text:'conceito'},{start:98,end:103,text:'fim'},{start:103,end:105,text:'após o vídeo'}],original=structuredClone(source),fixed=summaryCues(source,100);
 assert.deepEqual(fixed.cues,[source[1],{...source[2],end:100}]);assert.deepEqual(fixed.adjustments,{zeroDuration:1,afterVideo:1,clipped:1});assert.deepEqual(source,original);assert.doesNotThrow(()=>blocksFor(fixed.cues,100));
 for(const bad of [[{start:0,end:111,text:'muito além'}],[{start:5,end:4,text:'invertido'}],[{start:-1,end:2,text:'negativo'}],[{start:NaN,end:2,text:'inválido'}],Array.from({length:5},(_,i)=>({start:i,end:i,text:'sem duração'}))])assert.throws(()=>summaryCues(bad,100));
});
