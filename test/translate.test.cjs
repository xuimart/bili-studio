const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {parseSrt,validateTranslations,translateCaptions}=require('../translate.cjs');

test('localização do Ollama diferencia acesso negado de instalação ausente',()=>{
 const {findOllamaExecutable}=require('../translate.cjs');
 const options={env:{LOCALAPPDATA:path.join('profile','restricted'),PATH:path.join('tools','ollama')},home:'profile'};
 const denied=()=>{throw Object.assign(Error('denied'),{code:'EPERM'});};
 const absent=()=>{throw Object.assign(Error('absent'),{code:'ENOENT'});};
 assert.throws(()=>findOllamaExecutable({...options,stat:denied}),/não tem permissão/);
 assert.throws(()=>findOllamaExecutable({...options,stat:absent}),/executável do Ollama não foi encontrado/);
 const expected=path.join('tools','ollama','ollama.exe');
 assert.equal(findOllamaExecutable({...options,stat:file=>file===expected?{isFile:()=>true}:denied()}),expected);
});
test('tradução preserva todos os tempos e IDs, rejeita trechos faltantes e guarda original',async t=>{
 const input='1\n00:00:01,000 --> 00:00:02,500\nHello.\n\n2\n00:00:03,000 --> 00:00:05,000\nDrawing characters.\n';const cues=parseSrt(input);
 assert.throws(()=>validateTranslations({translations:[{id:1,text:'Olá'}]},cues));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bili-translation-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const srt=path.join(dir,'source.srt');fs.writeFileSync(srt,input);
 const result=await translateCaptions({srt,language:'en',model:'Whisper'},{generate:async(prompt,batch)=>({translations:batch.map(c=>({id:c.id,text:c.id===1?'Olá.':'Desenhando personagens.'}))})});
 const translated=parseSrt(fs.readFileSync(result.srt,'utf8'));assert.deepEqual(translated.map(c=>c.time),cues.map(c=>c.time));assert.deepEqual(translated.map(c=>c.text),['Olá.','Desenhando personagens.']);assert.equal(fs.readFileSync(srt,'utf8'),input);assert.equal(result.language,'pt');assert.match(fs.readFileSync(result.vtt,'utf8'),/00:00:01\.000 --> 00:00:02\.500/);
});

test('tradução interrompida retoma do trecho seguinte sem perder os tempos',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bili-translation-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const srt=path.join(dir,'resume.srt');fs.writeFileSync(srt,'1\n00:00:00,000 --> 00:00:01,000\nHello\n\n2\n00:00:01,000 --> 00:00:02,000\nWorld\n');const original={srt,language:'en',model:'Whisper'};
 await assert.rejects(translateCaptions(original,{generate:async(p,b)=>{if(b[0].id===2)throw Error('interrupted');return{translations:[{id:1,text:'Olá'}]};}}));
 const called=[];const result=await translateCaptions(original,{generate:async(p,b)=>{called.push(b[0].id);return{translations:[{id:b[0].id,text:'Mundo'}]};}});assert.deepEqual(called,[2]);assert.deepEqual(parseSrt(fs.readFileSync(result.srt,'utf8')).map(c=>c.text),['Olá','Mundo']);
});

test('tradução paralela grava na ordem original mesmo com respostas fora de ordem',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bili-translation-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const srt=path.join(dir,'parallel.srt');fs.writeFileSync(srt,[1,2,3].map(id=>id+'\n00:00:0'+id+',000 --> 00:00:0'+(id+1)+',000\nLine '+id).join('\n\n'));let active=0,max=0;
 const result=await translateCaptions({srt,language:'en',model:'Whisper'},{generate:async(p,b)=>{active++;max=Math.max(max,active);const id=b[0].id;await new Promise(r=>setTimeout(r,id===1?30:5));active--;return{translations:[{id,text:'Linha '+id}]};}});
 assert.ok(max>1);assert.deepEqual(parseSrt(fs.readFileSync(result.srt,'utf8')).map(c=>c.text),['Linha 1','Linha 2','Linha 3']);
});

test('tradução inicia próximo trecho sem esperar o mais lento do grupo',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bili-pool-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const srt=path.join(dir,'source.srt');fs.writeFileSync(srt,[1,2,3,4,5,6].map(id=>id+'\n00:00:0'+id+',000 --> 00:00:0'+(id+1)+',000\nLine '+id).join('\n\n'));let firstDone=false,fifthBeforeFirst=false;
 const result=await translateCaptions({srt,language:'en',model:'Whisper'},{generate:async(p,b)=>{const id=b[0].id;if(id===5)fifthBeforeFirst=!firstDone;await new Promise(r=>setTimeout(r,id===1?60:5));if(id===1)firstDone=true;return{translations:[{id,text:'Linha '+id}]};}});
 assert.ok(fifthBeforeFirst);assert.equal(parseSrt(fs.readFileSync(result.srt,'utf8')).length,6);
});

test('resposta JSON cortada gera nova tentativa com parâmetros diferentes e mantém o tempo',async()=>{
 const {translateWithOllama}=require('../translate.cjs');const cue={id:334,time:'00:16:41,440 --> 00:16:44,200',text:'important that you guys know about them because this covers'};const requests=[];
 const result=await translateWithOllama(cue,{model:'test',request:async(url,options)=>{requests.push(JSON.parse(options.body));return Response.json({done:true,response:requests.length===1?'{"translation":"é importante':JSON.stringify({translation:'é importante vocês conhecerem isso porque abrange'})});}});
 assert.equal(requests.length,2);assert.equal(requests[0].options.num_ctx,requests[1].options.num_ctx);assert.ok(requests[1].options.num_predict>requests[0].options.num_predict);assert.notEqual(requests[0].options.temperature,requests[1].options.temperature);assert.equal(result.id,cue.id);assert.equal(result.time,cue.time);
});

test('JSON válido com repetição ou fim por limite não é aceito como tradução completa',async()=>{
 const {translateWithOllama}=require('../translate.cjs');const cue={id:1,time:'00:00:00,000 --> 00:00:02,000',text:'Good morning everyone'};let calls=0;const contexts=[];
 const result=await translateWithOllama(cue,{model:'test',request:async(url,options)=>{contexts.push(JSON.parse(options.body).options.num_ctx);calls++;return Response.json({done:true,done_reason:calls===2?'length':'stop',response:JSON.stringify({translation:calls===1?'guys '.repeat(10):calls===2?'Bom':'Bom dia a todos'})});}});
 assert.equal(calls,3);assert.equal(result.text,'Bom dia a todos');assert.deepEqual(contexts,[2048,2048,2048]);
});

test('recuperação divide o texto difícil sem eliminar palavras nem criar novos tempos',async()=>{
 const {translateWithOllama}=require('../translate.cjs');const cue={id:2,time:'00:00:02,000 --> 00:00:04,000',text:'one two three four five six seven eight nine ten eleven twelve'};const pieces=[];
 const result=await translateWithOllama(cue,{model:'test',request:async(url,options)=>{const body=JSON.parse(options.body),input=JSON.parse(body.prompt.split('\n')[0]);if(input.source===cue.text)return Response.json({response:'{"translation":"'});pieces.push(input.source);return Response.json({response:JSON.stringify({translation:input.source.toUpperCase()})});}});
 assert.equal(pieces.join(' '),cue.text);assert.equal(result.text,cue.text.toUpperCase());assert.equal(result.id,cue.id);assert.equal(result.time,cue.time);
});

test('tradução parcial que deixa texto chinês é rejeitada e refeita em português',async()=>{
 const {translateWithOllama}=require('../translate.cjs');const cue={id:1,time:'00:00:00,000 --> 00:00:03,000',text:'我们将一起进行一些实践操作。'};let calls=0;
 const result=await translateWithOllama(cue,{model:'test',request:async()=>Response.json({response:JSON.stringify({translation:++calls===1?'Vamos juntos进行一些实践操作。':'Vamos realizar algumas atividades práticas juntos.'})})});
 assert.equal(calls,2);assert.doesNotMatch(result.text,/\p{Script=Han}/u);assert.equal(result.time,cue.time);
});

test('fallback de mandarim sem espaços conserva todos os caracteres do texto original',async()=>{
 const {translateWithOllama}=require('../translate.cjs');const cue={id:1,time:'00:00:00,000 --> 00:00:05,000',text:'我们将一起进行一些实践操作，然后分享每个人的作品与学习结果。'};const accepted=[];
 const result=await translateWithOllama(cue,{model:'test',request:async(url,options)=>{const input=JSON.parse(JSON.parse(options.body).prompt.split('\n')[0]).source;if(input===cue.text)return Response.json({response:'{"translation":"'});accepted.push(input);return Response.json({response:JSON.stringify({translation:'Tradução desta parte.'})});}});
 assert.equal(accepted.join(''),cue.text);assert.equal(result.id,cue.id);assert.equal(result.time,cue.time);
});

test('geração de legenda chinesa exige caracteres latinos no schema e preserva o intervalo',async()=>{
 const {translateWithOllama}=require('../translate.cjs');const cue={id:713,time:'01:44:25,200 --> 01:44:32,000',text:'每个角色都需要一个常规造型'};let pattern;
 const result=await translateWithOllama(cue,{model:'test',request:async(url,options)=>{pattern=JSON.parse(options.body).format.properties.translation.pattern;return Response.json({response:JSON.stringify({translation:'Cada personagem precisa de um visual padrão.'})});}});
 const regex=new RegExp(pattern,'u');assert.ok(regex.test('Ação, proporção e iluminação.'));assert.equal(regex.test('Português com 造型 no meio.'),false);assert.equal(result.time,cue.time);
});

test('fonte em inglês também rejeita intrusão de texto chinês na tradução portuguesa',async()=>{
 const {translateWithOllama}=require('../translate.cjs');const cue={id:510,time:'00:01:00,000 --> 00:01:04,000',text:'So these technologies, in most cases'};let calls=0;
 const result=await translateWithOllama(cue,{model:'test',request:async(url,options)=>{const schema=JSON.parse(options.body).format.properties.translation;assert.ok(schema.pattern);return Response.json({response:JSON.stringify({translation:++calls===1?'Essas tecnologias, em大多数情况下':'Essas tecnologias, na maioria dos casos'})});}});
 assert.equal(calls,2);assert.equal(result.text,'Essas tecnologias, na maioria dos casos');assert.equal(result.time,cue.time);
});

test('continuação de conversa após JSON completo é descartada sem aceitar JSON cortado',()=>{
 const {parseModelJSON}=require('../translate.cjs');assert.equal(parseModelJSON('{"translation":"Por que eles fazem bem"}<tool_call>\nuser\n{"translation":"1985-2006"}').translation,'Por que eles fazem bem');assert.throws(()=>parseModelJSON('{"translation":"texto cortado'),/incompleto/);assert.throws(()=>parseModelJSON('{"translation":"um"}{"translation":"outro"}'),/inesperado/);
});
