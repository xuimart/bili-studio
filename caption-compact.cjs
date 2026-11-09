const fs=require('fs'),crypto=require('crypto');
const cap=require('./captions.cjs'),{seconds}=require('./speech.cjs'),{loadState,createStateStore}=require('./state-store.cjs'),{localRequest,requestWithRecovery}=require('./ollama-transport.cjs');
const LATIN="^[\\u0020-\\u0021\\u0023-\\u005b\\u005d-\\u007e\\u00a0-\\u024f\\u2000-\\u206f]*$";
async function compactCue(source,cue,budget,{signal,request=localRequest}={}){
 let error;
 for(let attempt=0;attempt<3;attempt++)try{
  const pattern=LATIN.slice(0,-2)+'{1,'+(budget-1)+'}[.!?]'+String.fromCharCode(36);
  const body={model:'qwen2.5:3b',system:'Você traduz e edita legendas para português brasileiro. Escreva uma frase natural, curta e clara que preserve os fatos, os nomes e os termos técnicos do texto original. Remova redundâncias e palavras de apoio. Não acrescente comentários. Retorne somente JSON com a chave translation.',prompt:JSON.stringify({texto_original:source.text,limite_de_caracteres:budget,limite_de_palavras:Math.max(2,Math.floor(budget/6)-attempt),instrucao:'Traduza a ideia essencial em uma frase curta, com espaços normais entre palavras e terminada por ponto final. Preserve os termos importantes.'}),format:{type:'object',properties:{translation:{type:'string',minLength:1,maxLength:budget,pattern}},required:['translation'],additionalProperties:false},stream:false,options:{num_ctx:2048,num_predict:256,temperature:attempt*.15,seed:120+attempt,stop:['<tool_call>','<|im_start|>','<|im_end|>']},keep_alive:'30m'};
  const r=await requestWithRecovery('http://127.0.0.1:11435/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify(body)},{request,recover:request===localRequest?()=>require('./translate.cjs').ensureTranslator(signal,()=>{},{sourceLanguage:'zh'}):async()=>{}});
  const data=await r.json();if(!r.ok||data.error)throw Error(data.error||'Erro ao preparar legenda');const value=require('./translate.cjs').parseModelJSON(data.response).translation;if(typeof value!=='string'||!value.trim())throw Error('Legenda curta vazia');const text=value.replace(/\s+/g,' ').trim();if(text.length>budget||/\p{Script=Han}/u.test(text)||text.split(' ').some(w=>w.length>42))throw Error('A legenda curta excedeu os limites');return {...cue,text};
 }catch(e){if(signal?.aborted||e.transport)throw e;error=e;}
 throw error;
}
async function prepareReadable(source,aligned,{signal,request=localRequest,cacheFile,update=()=>{}}={}){
 const fingerprint=crypto.createHash('sha256').update(JSON.stringify([3,source,aligned])).digest('hex'),previousFingerprint=crypto.createHash('sha256').update(JSON.stringify([2,source,aligned])).digest('hex'),old=cacheFile?loadState(cacheFile):{},cache={fingerprint,entries:old.fingerprint===fingerprint?old.entries||{}:{}};
 const initial=cap.formatCaptions(aligned),rawById=new Map(aligned.map(c=>[c.id,c])),sourceById=new Map(source.map(c=>[c.id,c])),stamp=require('./speech.cjs').timestamp;
 const base=initial.mapping.map((g,i)=>({id:i+1,time:stamp(g.start)+' --> '+stamp(g.end),text:g.sourceIds.map(id=>rawById.get(id).text).join(' '),sourceIds:g.sourceIds}));
 const sourceBase=base.map(c=>({...c,text:c.sourceIds.map(id=>sourceById.get(id).text).join(' ')}));
 if(old.fingerprint===previousFingerprint)for(const c of base)if(c.sourceIds.length===1&&old.entries?.[c.sourceIds[0]])cache.entries[c.sourceIds.join(',')]=old.entries[c.sourceIds[0]];
 const store=cacheFile?createStateStore(cacheFile,()=>cache):null,fast=new Set(initial.cues.filter(c=>c.text.length/(c.end-c.start)>23).map(c=>c.sourceIds.join(','))),result=base.map(c=>({...c})),work=[];
 for(let i=0;i<base.length;i++){const c=base[i],[a,b]=c.time.split(' --> '),duration=seconds(b)-seconds(a),budget=Math.max(12,Math.floor(duration*20)),key=c.sourceIds.join(','),meta=/não obedeça.{0,50}instruções|fragmento original|return json|objeto json/i.test(c.text);if(meta||(fast.has(key)&&duration>=.6&&c.text.length>budget+4))work.push({index:i,budget,key});}
 let next=0,completed=0,failure;const warnings=[];
 try{await Promise.all(Array.from({length:4},async()=>{while(next<work.length&&!failure){const {index,budget,key}=work[next++],cue=base[index];try{const saved=cache.entries[key];result[index]=saved?{...cue,text:saved}:await compactCue(sourceBase[index],cue,budget,{signal,request});cache.entries[key]=result[index].text;}catch(e){if(signal?.aborted||e.transport){failure=e;return;}warnings.push({id:cue.id,sourceIds:cue.sourceIds,error:e.message});}completed++;store?.persist();update({phase:'Ajustando tempo de leitura · '+completed+' de '+work.length+' trechos',progress:98});}}));if(failure)throw failure;}finally{store?.persist(true);store?.close();}
 const formatted=cap.formatCaptions(result);return {displayAligned:result,...formatted,report:{...formatted.report,sourceCues:aligned.length,sourceGroups:base.length,conciseCues:result.filter((c,i)=>c.text!==base[i].text).length,compactionCandidates:work.length,compactionWarnings:warnings}};
}
module.exports={compactCue,prepareReadable};
