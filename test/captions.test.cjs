const test=require('node:test'),assert=require('node:assert/strict'),c=require('../captions.cjs');
test('parágrafo de 25 segundos vira blocos de duas linhas, sem apagar palavras',()=>{
 const text='Isso depende do caso individual, certo, boca não deve ser larga demais, pode até chegar ao olho pupila, algumas pessoas têm boca pequena, pode apenas atingir a abertura da pupila do olho, então isso pode variar e também varia de acordo com a posição dos olhos, se as pessoas tiverem os olhos muito separados, mas geralmente essa posição está neste local.';
 const original=[{id:508,time:'01:13:41,360 --> 01:14:06,140',text}],result=c.formatCaptions(original);assert.ok(result.cues.length>=5);assert.ok(result.cues.every(v=>v.lines.length<=2&&v.lines.every(l=>l.length<=42)&&v.end-v.start<=6.001));assert.equal(c.normalized(result.cues.map(v=>v.text).join(' ')),text);assert.equal(result.cues[0].start,4421.36);assert.ok(result.cues.at(-1).end<=4446.141);assert.equal(c.validateDisplay(result.srt,original).cues,result.cues.length);
});
test('fragmento com duração zero é incorporado à fala anterior sem perder texto',()=>{
 const input=[{id:1,time:'00:00:00,000 --> 00:00:02,000',text:'Vamos observar'},{id:2,time:'00:00:02,000 --> 00:00:02,000',text:'isso.'}],r=c.formatCaptions(input);assert.equal(c.normalized(r.cues.map(v=>v.text).join(' ')),'Vamos observar isso.');c.validateDisplay(r.srt,input);
});
test('legenda de leitor preserva acentos e não aceita sobreposição nem bloco de quatro linhas',()=>{
 assert.ok(c.wrap('Ação e proporção são importantes para a iluminação.',42).every(l=>l.length<=42));assert.throws(()=>c.validateDisplay('1\n00:00:00,000 --> 00:00:02,000\na\nb\nc\nd\n',[]),/limites/);
});

test('frase com vírgula que cabe em duas linhas permanece num bloco único',()=>{
 const input=[{id:1,time:'00:00:00,000 --> 00:00:04,000',text:'Esta frase curta, embora tenha uma pausa, cabe em duas linhas de leitura.'}];const r=c.formatCaptions(input);assert.equal(r.cues.length,1);assert.ok(r.cues[0].lines.every(l=>l.length<=42));
});
