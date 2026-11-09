const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');const {localRequest,requestWithRecovery}=require('../ollama-transport.cjs');
test('conexão interrompida é refeita em socket novo e mantém o corpo original',async t=>{
 let calls=0,recovered=0;const received=[];const server=http.createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;received.push(body);if(++calls===1){res.destroy();return;}res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({response:'ok'}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const url='http://127.0.0.1:'+server.address().port+'/api/generate';const response=await requestWithRecovery(url,{method:'POST',body:'{"same":true}'},{wait:async()=>{},recover:async()=>{recovered++;}});assert.equal(calls,2);assert.equal(recovered,1);assert.deepEqual(received,['{"same":true}','{"same":true}']);assert.equal((await response.json()).response,'ok');
});
test('serviço indisponível usa retentativas separadas e identifica a causa',async()=>{
 let calls=0,recovered=0;const options={request:async()=>{calls++;throw Object.assign(Error('offline'),{code:'ECONNREFUSED'});},wait:async()=>{},recover:async()=>{recovered++;},attempts:3};await assert.rejects(requestWithRecovery('http://127.0.0.1:11435',{},options),e=>e.transport&&/3 tentativas.*ECONNREFUSED/.test(e.message));assert.equal(calls,3);assert.equal(recovered,2);
});
test('cancelamento explícito não reinicia o tradutor nem repete a requisição',async()=>{
 const controller=new AbortController();let calls=0;await assert.rejects(requestWithRecovery('http://127.0.0.1:11435',{signal:controller.signal},{request:async()=>{calls++;controller.abort();throw Object.assign(Error('cancelado'),{code:'ECONNRESET'});},recover:async()=>assert.fail('Não deve reconectar após cancelamento'),wait:async()=>{}}));assert.equal(calls,1);
});
test('HTTP 503 transitório é recuperado antes de devolver a resposta ao tradutor',async()=>{
 let calls=0;const result=await requestWithRecovery('http://127.0.0.1:11435',{}, {request:async()=>({status:++calls===1?503:200}),wait:async()=>{}});assert.equal(result.status,200);assert.equal(calls,2);
});

test('falha durante a reconexão não elimina as próximas tentativas de transporte',async()=>{
 let calls=0;const r=await requestWithRecovery('http://127.0.0.1:11435',{}, {request:async()=>{if(++calls<3)throw Object.assign(Error('offline'),{code:'ECONNREFUSED'});return {status:200};},recover:async()=>{throw Error('ainda iniciando');},wait:async()=>{}});assert.equal(calls,3);assert.equal(r.status,200);
});
