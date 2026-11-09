const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {subtitleDelivery,applySubtitleRepairs}=require('../subtitle-delivery.cjs');
test('português solicitado nunca entrega transcrição chinesa após falha',()=>{
 const item={id:'export-a',subtitles:{language:'zh',srt:'fonte.srt'}};
 const state={operation:{currentId:item.id,resultId:item.id,status:'error'},workflow:{subtitleLanguage:'pt'}};
 const delivery=subtitleDelivery(item,state);assert.equal(delivery.ready,false);assert.equal(delivery.status,'error');assert.match(delivery.notice,/português falhou/);
 item.subtitleDelivery={requestedLanguage:'pt',status:'processing'};assert.equal(subtitleDelivery(item).ready,false);
});
test('legenda chinesa só é pronta quando idioma original foi solicitado',()=>{
 const item={id:'export-a',subtitles:{language:'zh',srt:'fonte.srt'},subtitleDelivery:{requestedLanguage:'original',status:'done'}};
 const result=subtitleDelivery(item);assert.equal(result.ready,true);assert.match(result.notice,/original.*mandarim/);
 item.subtitleDelivery.requestedLanguage='pt';assert.equal(subtitleDelivery(item).ready,false);
 item.subtitles.language='pt';assert.equal(subtitleDelivery(item).ready,true);
});
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bili-caption-repair-'));
 t.after(()=>{const resolved=fs.realpathSync(dir);assert.ok(resolved.startsWith(fs.realpathSync(os.tmpdir())+path.sep));assert.ok(path.basename(resolved).startsWith('bili-caption-repair-'));fs.rmSync(resolved,{recursive:true,force:true});});
 const file=path.join(dir,'video.mp4');fs.writeFileSync(file,'video fixture');
 const source=path.join(dir,'original.srt'),translated=path.join(dir,'pt.srt'),vtt=path.join(dir,'pt.vtt');
 fs.writeFileSync(source,'1\n00:00:00,000 --> 00:00:02,000\n你好\n');fs.writeFileSync(translated,'1\n00:00:00,000 --> 00:00:02,000\nOlá.\n');fs.writeFileSync(vtt,'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nOlá.\n');
 const id='export-a123',item={id,output:file,subtitles:{srt:source,language:'zh'}},stat=fs.statSync(file);
 const state={busy:false,exports:[item],jobs:[],linkQueue:[],workflow:{status:'error'},operation:{status:'error',resultId:id,total:1}},repair={exportId:id,output:file,video:{size:stat.size,mtimeMs:stat.mtimeMs},createdAt:new Date().toISOString(),subtitles:{srt:translated,vtt,alignedSrt:translated,displayAlignedSrt:translated,language:'pt',translated:true,original:{srt:source,language:'zh'}}};
 const folder=path.join(dir,'subtitle-repairs');fs.mkdirSync(folder);const json=path.join(folder,id+'.json');fs.writeFileSync(json,JSON.stringify(repair));
 return {dir,state,item,repair,json,source,translated,file};
}
test('recuperação aplica PT completo, preserva a fonte e não mexe nos outros trabalhos',t=>{
 const f=fixture(t);f.state.jobs=[{id:'other',status:'done'}];const jobs=JSON.stringify(f.state.jobs);
 assert.equal(applySubtitleRepairs(f.state,f.dir),1);assert.equal(f.item.subtitles.language,'pt');assert.equal(f.item.subtitleHistory[0].language,'zh');assert.equal(f.item.subtitleSource.language,'zh');assert.equal(f.state.operation.status,'done');assert.equal(f.state.workflow.status,'done');assert.equal(JSON.stringify(f.state.jobs),jobs);assert.match(fs.readFileSync(f.source,'utf8'),/你好/);assert.match(fs.readFileSync(f.file.replace('.mp4','.srt'),'utf8'),/Olá/);assert.equal(applySubtitleRepairs(f.state,f.dir),0);
});
test('recuperação espera o processamento atual terminar',t=>{
 const f=fixture(t);f.state.operation.status='running';assert.equal(applySubtitleRepairs(f.state,f.dir),0);assert.equal(f.item.subtitles.language,'zh');assert.ok(fs.existsSync(f.json));
});
test('recuperação rejeita arquivo de vídeo alterado',t=>{
 const f=fixture(t);fs.appendFileSync(f.file,' changed');assert.equal(applySubtitleRepairs(f.state,f.dir),0);assert.equal(f.state.operation.status,'error');assert.equal(f.item.subtitles.language,'zh');
});
test('recuperação rejeita texto chinês marcado como português',t=>{
 const f=fixture(t);fs.writeFileSync(f.translated,'1\n00:00:00,000 --> 00:00:02,000\n你好\n');assert.equal(applySubtitleRepairs(f.state,f.dir),0);assert.equal(f.item.subtitles.language,'zh');
});

test('originais e alinhamento completo ficam fora da escolha automática do player',t=>{
 const f=fixture(t),raw=path.join(f.dir,'video.whisper-123.srt'),aligned=path.join(f.dir,'video.pt-BR.aligned.srt'),display=path.join(f.dir,'video.pt-BR.display-aligned.srt');fs.renameSync(f.source,raw);f.item.subtitles.srt=raw;f.repair.subtitles.original.srt=raw;fs.copyFileSync(f.translated,aligned);fs.copyFileSync(f.translated,display);f.repair.subtitles.alignedSrt=aligned;f.repair.subtitles.displayAlignedSrt=display;fs.writeFileSync(f.json,JSON.stringify(f.repair));
 assert.equal(applySubtitleRepairs(f.state,f.dir),1);assert.equal(fs.existsSync(raw),false);assert.ok(f.item.subtitles.original.srt.includes('Legendas originais'));assert.match(fs.readFileSync(f.item.subtitles.original.srt,'utf8'),/你好/);assert.ok(f.item.subtitles.alignedSrt.includes('Dados da legenda'));assert.ok(fs.existsSync(f.translated));assert.ok(!fs.readdirSync(f.dir).some(n=>n.endsWith('.aligned.srt')||n.includes('.whisper-')));
});
