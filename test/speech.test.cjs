const test=require('node:test'),assert=require('node:assert/strict');const speech=require('../speech.cjs');
test('detecção usa consenso de trechos confiáveis e ignora silêncio e incerteza',()=>{
 const result=speech.chooseLanguage([{language:'en',confidence:.99,peakDb:-20},{language:'zh',confidence:.99,peakDb:-18},{language:'zh',confidence:.998,peakDb:-25},{language:'en',confidence:.35,peakDb:-50},{language:'en',confidence:.99,peakDb:-80}]);
 assert.equal(result.language,'zh');assert.equal(result.mixed,false);assert.equal(result.reliableSamples,3);assert.throws(()=>speech.chooseLanguage([{language:'en',confidence:.35}]),/com segurança/);
 assert.deepEqual(speech.parseDetection('whisper_full: auto-detected language: zh (p = 0.992143)'),{language:'zh',confidence:.992143});
});
test('amostras respeitam duração curta e incluem pontos distantes em vídeos longos',()=>{
 assert.deepEqual(speech.sampleOffsets(10),[0]);const offsets=speech.sampleOffsets(42089);assert.ok(offsets.includes(45));assert.ok(offsets.some(s=>s>20000));assert.ok(offsets.every(s=>s>=0&&s<=42089-25));
});
test('blocos recompõem os tempos globais acima de uma hora sem deslocar a fala',()=>{
 const cues=speech.parseChunk('1\n00:00:01,250 --> 00:00:03,500\n你好\n\n2\n00:00:09,000 --> 00:00:10,000\n世界\n',7200,10);assert.equal(speech.timestamp(cues[0].start),'02:00:01,250');assert.equal(speech.timestamp(cues[1].end),'02:00:10,000');assert.equal(cues.map(c=>c.text).join(' '),'你好 世界');assert.throws(()=>speech.parseChunk('1\n00:00:10,000 --> 00:00:02,000\nErro',0,20),/inválidos/);
});
test('transcrição em repetição não é aceita como legenda concluída',()=>{
 assert.equal(speech.transcriptQuality(Array.from({length:12},()=>({text:'I think it is important in this world.'}))).suspicious,true);assert.equal(speech.transcriptQuality([{text:'Vamos desenhar.'},{text:'Olhe o plano.'}]).suspicious,false);
});

test('detecta repetição dentro de um único trecho antes de enviá-lo ao tradutor',()=>{
 const result=speech.transcriptQuality([{text:'Texto normal'},{text:'啊'.repeat(134)},{text:'Continuação normal'}]);assert.equal(result.suspicious,true);assert.deepEqual(result.repetitiveCues,[2]);
});
