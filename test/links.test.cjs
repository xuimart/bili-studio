const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeUrl,resolveShortLink,makeExtractedLibrary,discover}=require('../library.cjs');
const cases=[
 ['bilibili.com/video/BV1Q3411772i/','https://www.bilibili.com/video/BV1Q3411772i/'],
 ['www.bilibili.com/pt-BR/video/BV1Q3411772i/?p=2','https://www.bilibili.com/video/BV1Q3411772i/'],
 ['b23.tv/Abc12','https://b23.tv/Abc12'],
 ['https://www.bilibili.com/video/BV1Q3411772i/?spm=1&amp;p=3#reply','https://www.bilibili.com/video/BV1Q3411772i/'],
 ['https://www.bilibili.com/zh-Hans/video/BV1Q3411772i/?spm_id_from=333.1387.0.0','https://www.bilibili.com/video/BV1Q3411772i/'],
 ['https://www.bilibili.com/zh-Hant/video/BV1Q3411772i/','https://www.bilibili.com/video/BV1Q3411772i/'],
 ['https://www.bilibili.com/zh-Hans-CN/video/BV1Q3411772i/','https://www.bilibili.com/video/BV1Q3411772i/'],
 ['https://www.bilibili.com/zh-Hant-TW/video/BV1Q3411772i/?p=2','https://www.bilibili.com/video/BV1Q3411772i/'],
 ['https://m.bilibili.com/zh-hans/video/BV1Q3411772i/','https://www.bilibili.com/video/BV1Q3411772i/'],
 ['https://www.bilibili.com/en-Latn-US/video/av123/','https://www.bilibili.com/video/av123/'],
 ['https://www.bilibili.com/es-419/video/BV1Q3411772i/','https://www.bilibili.com/video/BV1Q3411772i/'],
 ['BV17GsezzEyi','https://www.bilibili.com/video/BV17GsezzEyi/'],
 ['av123456','https://www.bilibili.com/video/av123456/'],
 ['https://player.bilibili.com/player.html?bvid=BV17GsezzEyi&cid=123','https://www.bilibili.com/video/BV17GsezzEyi/'],
 ['https://player.bilibili.com/player.html?aid=123&cid=456','https://www.bilibili.com/video/av123/'],
 ['https://b23.tv/Abc12?share_source=copy','https://b23.tv/Abc12'],
 ['https://space.bilibili.com/2142762/lists/3662502?type=season&spm_id_from=abc','https://space.bilibili.com/2142762/lists/3662502?type=season'],
 ['https://space.bilibili.com/1958703906/lists/547718?type=series','https://space.bilibili.com/1958703906/lists/547718?type=series'],
 ['https://space.bilibili.com/123/channel/collectiondetail?sid=234&x=y','https://space.bilibili.com/123/channel/collectiondetail?sid=234'],
 ['https://space.bilibili.com/123/channel/seriesdetail?sid=234','https://space.bilibili.com/123/channel/seriesdetail?sid=234'],
 ['https://space.bilibili.com/84912/favlist?fid=1103407912&ftype=create','https://space.bilibili.com/84912/favlist?fid=1103407912'],
 ['https://space.bilibili.com/3985676/upload/video','https://space.bilibili.com/3985676/upload/video'],
 ['https://space.bilibili.com/3985676','https://space.bilibili.com/3985676'],
 ['https://www.bilibili.com/medialist/detail/ml123','https://www.bilibili.com/medialist/detail/ml123'],
 ['https://www.bilibili.com/medialist/play/123?business=space_collection&business_id=456','https://www.bilibili.com/medialist/play/123?business=space_collection&business_id=456'],
 ['https://www.bilibili.com/list/1958703906?sid=547718','https://www.bilibili.com/list/1958703906?sid=547718'],
 ['https://www.bilibili.com/bangumi/play/ep21495/','https://www.bilibili.com/bangumi/play/ep21495/'],
 ['https://www.bilibili.com/bangumi/play/ss26801','https://www.bilibili.com/bangumi/play/ss26801/'],
 ['https://www.bilibili.com/bangumi/media/md24097891','https://www.bilibili.com/bangumi/media/md24097891/'],
 ['https://www.bilibili.com/cheese/play/ss123','https://www.bilibili.com/cheese/play/ss123/'],
 ['https://t.bilibili.com/123456','https://t.bilibili.com/123456']
];
for(const [input,expected]of cases)test('link: '+input,()=>assert.equal(normalizeUrl(input),expected));

test('prefixo de idioma não permite caminhos extras, tags malformadas ou hosts externos',()=>{
 for(const url of ['https://www.bilibili.com/zh-Hans/extra/video/BV1Q3411772i/','https://www.bilibili.com/zh_Hans/video/BV1Q3411772i/','https://www.bilibili.com/zh--Hans/video/BV1Q3411772i/','https://evil.test/zh-Hans/video/BV1Q3411772i/'])assert.throws(()=>normalizeUrl(url));
});
test('descoberta do link zh-Hans consulta o vídeo canônico e mantém todas as partes',async()=>{
 let requested;
 const result=await discover(cases[0][0],'',async url=>{requested=url;return {ok:true,text:async()=>'<script>window.__INITIAL_STATE__ = '+JSON.stringify({videoData:{bvid:'BV1Q3411772i',title:'Teste',pages:[{page:1,part:'A',duration:10},{page:2,part:'B',duration:20}]}})+';</script>'};});
 assert.equal(requested,'https://www.bilibili.com/video/BV1Q3411772i/');assert.equal(result.entries.length,2);assert.equal(result.entries[1].url,'https://www.bilibili.com/video/BV1Q3411772i/?p=2');
});
test('adaptador aceita identificadores BV planos e recusa partes inválidas e destinos externos',()=>{
 const source='https://space.bilibili.com/1/lists/2?type=season';
 const result=makeExtractedLibrary({entries:[{id:'BV1Q3411772i',url:'BV1Q3411772i',title:'Aula'}]},source);assert.equal(result.entries[0].url,'https://www.bilibili.com/video/BV1Q3411772i/?p=1');
 assert.equal(makeExtractedLibrary({entries:[{url:'www.bilibili.com/video/BV1Q3411772i/?p=2'}]},source).entries[0].page,2);
 for(const url of ['https://www.bilibili.com/video/BV1Q3411772i/?p=-2','https://www.bilibili.com/video/BV1Q3411772i/?p=1.5','https://www.bilibili.com/video/BV1Q3411772i/?p=Infinity','https://evil.test/video/BV1Q3411772i/'])assert.throws(()=>makeExtractedLibrary({entries:[{url}]},source));
 for(const url of ['bilibili.com.evil.test/video/BV1Q3411772i','bilibili.com@evil.test/video/BV1Q3411772i','www.bilibili.com:9000/video/BV1Q3411772i'])assert.throws(()=>normalizeUrl(url));
});
test('link curto valida cada redirecionamento antes de acessar o próximo destino',async()=>{
  let calls=0;const request=async()=>{calls++;return new Response(null,{status:302,headers:{Location:'https://www.bilibili.com/pt/video/BV17GsezzEyi/?p=3'}});};
  assert.equal(await resolveShortLink('https://b23.tv/abc',request),'https://www.bilibili.com/video/BV17GsezzEyi/');assert.equal(calls,1);
  await assert.rejects(resolveShortLink('https://b23.tv/abc',async()=>new Response(null,{status:302,headers:{Location:'http://127.0.0.1:11435/api/tags'}})));
  await assert.rejects(resolveShortLink('https://b23.tv/abc',async()=>new Response(null,{status:302,headers:{Location:'https://b23.tv/loop'}})),/redirecionamentos/);
});
test('bibliotecas extraídas mantêm partes, ordem, IDs distintos e removem duplicatas',()=>{
  const a={id:'BV17GsezzEyi',url:'https://www.bilibili.com/video/BV17GsezzEyi/?p=1',title:'A',duration:10};const b={...a,url:a.url.replace('p=1','p=2'),title:'B'};
  const result=makeExtractedLibrary({title:'Coleção',entries:[{entries:[a,b,a]}]},'https://space.bilibili.com/1/lists/2?type=season');
  assert.deepEqual(result.entries.map(e=>e.page),[1,2]);assert.equal(result.duration,20);assert.notEqual(result.entries[0].id,result.entries[1].id);
});
test('episódios bloqueados, incompletos, live e listas grandes não desaparecem silenciosamente',()=>{
  for(const info of [{entries:[]},{entries:[{id:'123'}]},{is_live:true},{playlist_count:1001,entries:[]}])assert.throws(()=>makeExtractedLibrary(info,'https://www.bilibili.com/bangumi/play/ss1/'));
  for(const link of ['https://www.bilibili.com/audio/au123','https://www.bilibili.com/audio/am123','https://live.bilibili.com/123','https://www.bilibili.tv/en/video/123'])assert.throws(()=>normalizeUrl(link));
});
test('descoberta de coleção usa adaptador de extração com cookies sem executar página',async()=>{
  const url='https://space.bilibili.com/1/lists/2?type=season';let called=false;
  const library=await discover(url,'',fetch,{extract:async value=>{assert.equal(value,url);called=true;return {title:'Curso',entries:[{id:'BV17GsezzEyi',url:'https://www.bilibili.com/video/BV17GsezzEyi/'}]};}});
  assert.equal(called,true);assert.equal(library.entries.length,1);
});
