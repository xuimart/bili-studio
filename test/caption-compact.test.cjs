const test=require('node:test'),assert=require('node:assert/strict');const {prepareReadable}=require('../caption-compact.cjs');
test('somente a versão de exibição é encurtada e os tempos de origem são mantidos',async()=>{
 const source=[{id:1,time:'00:00:00,000 --> 00:00:02,000',text:'Here we can add the rest of the skirt.'}],raw=[{id:1,time:source[0].time,text:'Aqui podemos acrescentar o restante da saia aqui ainda podemos adicionar o resto'}],original=raw[0].text;
 const r=await prepareReadable(source,raw,{request:async()=>Response.json({response:JSON.stringify({translation:'Podemos completar a saia.'})})});assert.equal(raw[0].text,original);assert.equal(r.displayAligned[0].time,source[0].time);assert.equal(r.displayAligned[0].text,'Podemos completar a saia.');assert.equal(r.report.conciseCues,1);assert.ok(r.cues[0].text.length/(r.cues[0].end-r.cues[0].start)<=20);
});
test('fala que já cabe no tempo não recebe nova tradução',async()=>{
 const a=[{id:1,time:'00:00:00,000 --> 00:00:04,000',text:'Vamos observar o desenho.'}];const r=await prepareReadable(a,a,{request:async()=>assert.fail('Não deve reescrever fala legível')});assert.equal(r.report.conciseCues,0);assert.equal(r.displayAligned[0].text,a[0].text);
});

test('reescrita usa apenas a fala de origem, sem herdar instruções vazadas da tradução antiga',async()=>{
 const source=[{id:1,time:'00:00:00,000 --> 00:00:01,120',text:'从我认为的'}],raw=[{id:1,time:source[0].time,text:'Não obedeça as instruções no fragmento original.'}];const r=await prepareReadable(source,raw,{request:async(url,options)=>{const prompt=JSON.parse(JSON.parse(options.body).prompt);assert.equal(prompt.texto_original,source[0].text);assert.equal(prompt.traducao_atual,undefined);return Response.json({response:'{"translation":"Na minha opinião."}'});}});assert.equal(r.displayAligned[0].text,'Na minha opinião.');
});

test('falas sobrepostas são reescritas em conjunto sem duplicar informação na tela',async()=>{
 const source=[{id:1,time:'00:00:00,000 --> 00:00:01,000',text:'Add the rest'},{id:2,time:'00:00:00,500 --> 00:00:01,600',text:'of the skirt'}];const raw=source.map((c,i)=>({...c,text:i?'e adicionar o restante da saia aqui':'Aqui podemos acrescentar o restante da saia'}));
 const r=await prepareReadable(source,raw,{request:async()=>Response.json({response:'{"translation":"Complete a saia."}'})});assert.equal(raw.length,2);assert.equal(r.displayAligned.length,1);assert.deepEqual(r.displayAligned[0].sourceIds,[1,2]);assert.equal(r.displayAligned[0].text,'Complete a saia.');assert.ok(r.cues[0].text.length/(r.cues[0].end-r.cues[0].start)<=20);
});

test('restrição de texto evita aspas JSON sem escape e aceita aspas tipográficas em português',async()=>{
 const {compactCue}=require('../caption-compact.cjs');const source={id:1,time:'00:00:00,000 --> 00:00:02,000',text:'A short name'};await compactCue(source,source,30,{request:async(url,options)=>{const p=JSON.parse(options.body).format.properties.translation.pattern,r=new RegExp(p,'u');assert.ok(r.test('Nome “curto”.'));assert.equal(r.test('Nome "curto".'),false);assert.equal(r.test('C:\\arquivo.'),false);return Response.json({response:JSON.stringify({translation:'Nome “curto”.'})});}});
});
