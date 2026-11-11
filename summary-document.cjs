const fs=require('node:fs'),path=require('node:path');
const {timeLink}=require('./desktop/deep-links.cjs');
const VERSION=1,pending=new Map();
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function clock(s){s=Math.floor(s);return[Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(n=>String(n).padStart(2,'0')).join(':');}
function summaryHtml(item){
 const summary=item.topicSummary;if(!summary?.topics?.length)throw Error('Gere o sumário por assuntos primeiro.');
 if(!Number.isFinite(summary.duration)||summary.duration<=0)throw Error('Duração inválida no sumário.');
 const topics=summary.topics.map((t,i)=>{if(!Number.isFinite(t.start)||!Number.isFinite(t.end)||t.start<0||t.end<=t.start||t.end>summary.duration)throw Error('Tempo inválido no sumário.');return `<article><a href="${escape(timeLink(item.id,t.start))}" class="topic"><span class="number">${String(i+1).padStart(2,'0')}</span><span><span class="time">${clock(t.start)} - ${clock(t.end)}</span><h2>${escape(t.title)}</h2></span><span class="go">ABRIR →</span></a><p>${escape(t.description)}</p></article>`;}).join('');
 return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Sumário - ${escape(item.playlistTitle||item.title)}</title><style>
 @page{size:A4;margin:17mm 17mm 20mm}*{box-sizing:border-box}body{font:11pt/1.5 'Segoe UI','Microsoft YaHei',Arial,sans-serif;color:#242331;margin:0 auto;max-width:840px;background:white}header{border-bottom:3px solid #7250b5;padding-bottom:18px;margin-bottom:18px}.brand{font-size:10pt;font-weight:700;letter-spacing:2px;color:#7250b5}h1{font-size:23pt;line-height:1.25;overflow-wrap:anywhere;margin:14px 0}header p{color:#666273;font-size:10pt;margin:8px 0}.instruction{background:#f0ebfa;padding:12px 15px;border-radius:8px;color:#403251}article{break-inside:avoid;page-break-inside:avoid;border-bottom:1px solid #ddd8e8;padding:13px 0}.topic{display:flex;gap:12px;align-items:flex-start;color:#32234d;text-decoration:none}.topic:hover h2{text-decoration:underline}.topic>span:nth-child(2){min-width:0;flex:1;overflow-wrap:anywhere}.number{flex-shrink:0;font-size:10pt;color:#8b8297;padding-top:4px;min-width:23px}.time{font-size:10pt;font-weight:600;color:#7250b5}h2{font-size:13pt;line-height:1.35;margin:3px 0}.go{flex-shrink:0;margin-left:auto;white-space:nowrap;font-size:8pt;font-weight:700;letter-spacing:.5px;color:#7250b5;padding-top:5px}article p{margin:6px 0 0 35px;font-size:10pt;color:#595366}.note{font-size:9pt;color:#777181;margin-top:22px}a:focus-visible{outline:2px solid #7250b5;outline-offset:4px}@media screen{body{padding:30px 24px}}@media(max-width:500px){.go{display:none}h1{font-size:20pt}}</style><header><div class="brand">BILI STUDIO · SUMÁRIO CLICÁVEL</div><h1>${escape(item.playlistTitle||item.title)}</h1><p>${summary.topics.length} assuntos · Duração ${clock(summary.duration)}</p><div class="instruction">Clique no <strong>assunto ou no horário</strong> para abrir o vídeo nesse trecho no Bili Studio.</div><p>Requer o Bili Studio instalado e esta biblioteca no mesmo perfil. O leitor de PDF pode pedir confirmação para abrir o aplicativo.</p></header><main>${topics}</main><p class="note">Sumário automático baseado na legenda. Assuntos e limites podem precisar de revisão. Vídeo e legenda permanecem separados deste documento.</p></html>`;
}
async function exportSummaryDocuments(item,{renderPdf}={}){
 const summary=item.topicSummary;if(!summary?.markdown)throw Error('Sumário ainda não está pronto.');
 const key=item.id+':'+summary.fingerprint;if(pending.has(key))return pending.get(key);
 const task=(async()=>{
  const base=summary.markdown.replace(/\.md$/i,''),html=base+'.html';
  const pdf=item.output?path.join(path.dirname(item.output),require('./library-files.cjs').titleStem(path.dirname(item.output),'Sumário - '+path.basename(item.output,path.extname(item.output)))+'.pdf'):base+'.pdf';
  if(summary.documentVersion===VERSION&&fs.existsSync(html)&&(!renderPdf||summary.pdf===pdf&&fs.existsSync(pdf)))return summary;
  const document=summaryHtml(item);require('./captions.cjs').write(html,document);summary.html=html;
  if(renderPdf){const bytes=await renderPdf(document);if(!Buffer.isBuffer(bytes)||!bytes.subarray(0,5).equals(Buffer.from('%PDF-'))||bytes.length<1500)throw Error('O PDF não foi gerado corretamente.');
   if(fs.existsSync(pdf)&&!fs.readFileSync(pdf).equals(bytes))fs.copyFileSync(pdf,path.join(path.dirname(summary.markdown),'PDF-anterior-'+Date.now()+'.pdf'),fs.constants.COPYFILE_EXCL);
   fs.writeFileSync(pdf+'.tmp',bytes);fs.renameSync(pdf+'.tmp',pdf);summary.pdf=pdf;
  }
  summary.documentVersion=VERSION;if(summary.json)require('./captions.cjs').write(summary.json,JSON.stringify(summary,null,2));return summary;
 })();pending.set(key,task);try{return await task;}finally{pending.delete(key);}
}
module.exports={summaryHtml,exportSummaryDocuments};
