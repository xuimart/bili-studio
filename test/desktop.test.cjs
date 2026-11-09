const test=require('node:test'),assert=require('node:assert/strict');
const {busy,canInstall,allowedExternal}=require('../desktop/update-policy.cjs');
const {validateImport}=require('../desktop/migration.cjs');
test('atualização nunca instala durante download, processamento, auditoria ou fila',()=>{
  for(const state of [{busy:true},{auditing:true},{discovering:true},{queueEnabled:true},{operation:{status:'running'}},{components:{status:'running'}}]){assert.equal(busy(state),true);assert.equal(canInstall(state,true),false);}
  assert.equal(canInstall({operation:{status:'done'}},true),true);assert.equal(canInstall({},false),false);
});
test('janela só permite abrir externamente destinos HTTPS conhecidos',()=>{
  assert.equal(allowedExternal('https://github.com/xuimart/bili-studio'),true);
  for(const value of ['file:///C:/Windows','javascript:alert(1)','https://github.com.evil.test','https://user:pwd@github.com','http://github.com','https://github.com:9443'])assert.equal(allowedExternal(value),false);
});
test('importação exige estrutura de biblioteca e conserva caminhos e trabalhos',()=>{
  const state={jobs:[{output:'C:\\Vídeos\\a.mp4'}],exports:[],linkQueue:[{status:'done'}]};assert.deepEqual(validateImport(JSON.stringify(state)),state);
  for(const value of ['{}','null','[]',JSON.stringify({...state,jobs:[{output:{invalid:true}}]})])assert.throws(()=>validateImport(value));
});
