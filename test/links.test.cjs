const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeUrl,resolveShortLink,makeExtractedLibrary,discover}=require('../library.cjs');
const cases=[
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
