const test=require('node:test'),assert=require('node:assert/strict');
const {fetchRetry}=require('../runtime-tools.cjs');
test('preparo de componentes recupera erros temporários com tentativas limitadas',async()=>{
  let calls=0,delays=[];const r=await fetchRetry('https://example.invalid',{}, {request:async()=>new Response('x',{status:++calls<3?503:200}),delay:async ms=>delays.push(ms)});
  assert.equal(r.status,200);assert.equal(calls,3);assert.deepEqual(delays,[500,1000]);
  calls=0;const denied=await fetchRetry('x',{}, {request:async()=>{calls++;return new Response(null,{status:403});},delay:async()=>{}});assert.equal(denied.status,403);assert.equal(calls,1);
  calls=0;const failed=await fetchRetry('x',{}, {request:async()=>{calls++;return new Response(null,{status:500});},delay:async()=>{}});assert.equal(failed.status,500);assert.equal(calls,5);
});
test('preparo respeita cancelamento e não continua tentando',async()=>{
  const signal=AbortSignal.abort();let calls=0;await assert.rejects(fetchRetry('x',{signal},{request:async()=>{calls++;},delay:async()=>{}}));assert.equal(calls,0);
});
