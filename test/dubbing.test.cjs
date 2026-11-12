const test=require('node:test'),assert=require('node:assert/strict');
const {makeSegments,calibrate,estimate,compatibleBenchmark,voice}=require('../dubbing.cjs');
test('dublagem ancora início e fim, limita frases longas e conserva o texto',()=>{
 const text='Vamos observar o esqueleto e dividir o corpo em blocos. Depois vamos desenhar o tórax e a coluna com atenção à perspectiva.',cues=[{start:0,end:29,text},{start:32,end:35,text:'Agora refinamos o desenho.'}],result=makeSegments(cues,40);
 assert.equal(result[0].start,0);assert.equal(result.at(-1).end,35);assert.equal(result.map(s=>s.text).join(' '),cues.map(s=>s.text).join(' '));assert.ok(result.every((s,i)=>s.end-s.start<=10&&(!i||s.start>=result[i-1].end)));
 assert.throws(()=>makeSegments([{start:2,end:1,text:'invertido'}],30));assert.throws(()=>voice('comando externo'));
 const anchored=makeSegments([{start:0,end:10,text:'Vamos observar o desenho e ajustar as formas.'}],12,[{start:0,end:2},{start:9,end:12}]);assert.equal(anchored[0].start,2);assert.equal(anchored.at(-1).end,9);
 const dense='Vamos observar melhor essas formas antes de continuar desenhando.';
 const spaced=makeSegments([{start:51.24,end:52.6,text:dense}],60);assert.equal(spaced.map(s=>s.text).join(' '),dense);assert.ok(spaced[0].start>=50.24&&spaced.at(-1).end<=53.6);assert.ok(spaced.at(-1).end-spaced[0].start>1.36);
 assert.throws(()=>makeSegments([{start:0,end:1,text:Array(40).fill('desenho').join(' ')}],1),/00:00:00/);
});
test('calibração mede voz real e separa preparação; estimativa rejeita outra máquina, motor ou voz',async()=>{
 let request;const result=await calibrate('male',{worker:async plan=>{request=plan;return{speechSeconds:30,synthesisSeconds:12,loadSeconds:8,preparationSeconds:900,hardware:'CPU de teste'};}});
 assert.equal(request.mode,'benchmark');assert.equal(request.segments.length,3);assert.equal(request.duration,30);assert.equal(result.rtf,.4);assert.ok(compatibleBenchmark(result,'male'));assert.equal(compatibleBenchmark({...result,machine:'outro'},'male'),null);assert.equal(compatibleBenchmark(result,'female'),null);assert.equal(estimate(3600,{...result,engine:'outro'},'male'),null);
 const hour=estimate(3600,result,'male'),long=estimate(43200,result,'male');assert.ok(hour.lowerSeconds<hour.upperSeconds);assert.ok(long.lowerSeconds>hour.upperSeconds);assert.ok(hour.excludes.includes('preparação inicial'));assert.equal(hour.synthesisSeconds,1440);
 await assert.rejects(calibrate('male',{worker:async()=>({speechSeconds:0,synthesisSeconds:0})}));
});
