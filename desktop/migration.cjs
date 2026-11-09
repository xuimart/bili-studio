function validateImport(text){
  const state=JSON.parse(text);
  if(!state||typeof state!=='object'||!Array.isArray(state.jobs)||!Array.isArray(state.exports)||!Array.isArray(state.linkQueue))throw Error('Este arquivo não é uma biblioteca Bili Studio.');
  for(const item of [...state.jobs,...state.exports])if(item.output!==undefined && item.output!==null && typeof item.output!=='string')throw Error('A biblioteca contém um caminho inválido.');
  return state;
}
module.exports={validateImport};
