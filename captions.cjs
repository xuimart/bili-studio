const fs=require('node:fs');
const {seconds,timestamp}=require('./speech.cjs');
const STOP=new Set(['a','o','as','os','um','uma','de','do','da','dos','das','em','no','na','nos','nas','para','por','com','e','que','se']);
function cleanPunctuation(text){return text.replace(/[,;:]+\s*([.!?])/g,(_,mark)=>mark);}
function normalized(text){return text.replace(/\s+/g,' ').trim();}
function wrap(text,max=42){const words=normalized(text).split(' ');if(words.some(w=>w.length>max))throw Error('Uma palavra excedeu '+max+' caracteres.');if(text.length<=max)return [text];let best;for(let i=1;i<words.length;i++){const a=words.slice(0,i).join(' '),b=words.slice(i).join(' ');if(a.length>max||b.length>max)continue;const score=Math.abs(a.length-b.length)+(STOP.has(words[i-1].toLowerCase())?15:0);if(!best||score<best.score)best={score,lines:[a,b]};}return best?.lines;}
function pieces(text,max=42){let words=normalized(text).split(' '),result=[];while(words.length){let count=0;for(let n=1;n<=words.length;n++){const part=words.slice(0,n).join(' ');if(part.length>max*2+1||!wrap(part,max))break;count=n;}if(!count)throw Error('Não foi possível quebrar a legenda sem cortar uma palavra.');if(count<words.length)for(let n=count;n>=1;n--){const part=words.slice(0,n).join(' ');if(part.length>=40&&/[.!?;:,]$/.test(part)){count=n;break;}}result.push(words.slice(0,count).join(' '));words=words.slice(count);}return result;}
function formatCaptions(aligned,{maxLine=42,maxDuration=6}={}){
 const groups=[];for(const cue of aligned){const [a,b]=cue.time.split(' --> '),start=seconds(a),end=seconds(b),text=normalized(cue.text);if(end<start)throw Error('Intervalo de legenda invertido.');const prev=groups.at(-1);if(prev&&(end-start<.08||start<prev.end-.001)){prev.text+=' '+text;prev.end=Math.max(prev.end,end);prev.sourceIds.push(...(cue.sourceIds||[cue.id]));}else groups.push({start,end,text,sourceIds:[...(cue.sourceIds||[cue.id])]});}
 for(let i=0;i<groups.length-1;i++){
  const a=groups[i],b=groups[i+1],gap=b.start-a.end,span=b.end-a.start,rate=a.text.length/Math.max(.04,a.end-a.start),combined=(a.text.length+b.text.length+1)/Math.max(.04,span);
  if((rate>23||a.end-a.start<.7)&&gap>=-.002&&gap<=.35&&span<=10&&combined<=23){a.text+=' '+b.text;a.end=b.end;a.sourceIds.push(...b.sourceIds);groups.splice(i+1,1);i=Math.max(-1,i-1);}
 }
 const cues=[],mapping=[];let fast=0;
 for(let g=0;g<groups.length;g++){
  const firstDisplay=cues.length;
  const group=groups[g],duration=Math.max(.001,group.end-group.start),parts=pieces(group.text,maxLine),temporal=Math.ceil(duration/maxDuration);
  while(parts.length<temporal&&group.text.length/temporal>=25){let at=-1;for(let i=0;i<parts.length;i++)if(parts[i].includes(' ')&&(at<0||parts[i].length>parts[at].length))at=i;if(at<0)break;const words=parts[at].split(' ');let split=1,best=Infinity;for(let i=1;i<words.length;i++){const delta=Math.abs(words.slice(0,i).join(' ').length-words.slice(i).join(' ').length);if(delta<best){best=delta;split=i;}}parts.splice(at,1,words.slice(0,split).join(' '),words.slice(split).join(' '));}
  const weight=parts.reduce((n,p)=>n+p.length,0);let used=0;
  for(let i=0;i<parts.length;i++){
   const part=parts[i],start=group.start+duration*used/weight;used+=part.length;let end=Math.min(group.start+duration*used/weight,start+maxDuration);
   const nextGroup=groups[g+1]?.start??group.end+.8;
   if(i===parts.length-1&&end-start<Math.min(.8,part.length/20))end=Math.min(start+Math.min(.8,part.length/20),nextGroup-.04);
   if(end<=start)end=start+.04;
   const lines=wrap(part,maxLine);if(!lines||lines.length>2)throw Error('Quebra de linhas inválida.');const cue={id:cues.length+1,start,end,text:part,lines,sourceIds:group.sourceIds};if(part.length/(end-start)>23)fast++;cues.push(cue);
  }
  mapping.push({sourceIds:group.sourceIds,start:group.start,end:group.end,displayIds:cues.slice(firstDisplay).map(c=>c.id)});
 }
 if(normalized(cues.map(c=>c.text).join(' '))!==normalized(aligned.map(c=>c.text).join(' ')))throw Error('O formato de leitura alterou as palavras da tradução.');
 for(let i=0;i<cues.length;i++){const cue=cues[i],limit=i+1<cues.length?cues[i+1].start-.04:cue.end+.8;cue.end=Math.max(cue.end,Math.min(cue.start+maxDuration,limit,cue.start+cue.text.length/20));}
 fast=cues.filter(c=>c.text.length/(c.end-c.start)>23).length;
 const srt=cues.map(c=>c.id+'\n'+timestamp(c.start)+' --> '+timestamp(c.end)+'\n'+c.lines.map(cleanPunctuation).join('\n')).join('\n\n')+'\n';
 const vtt='WEBVTT\n\n'+cues.map(c=>timestamp(c.start).replace(',','.')+' --> '+timestamp(c.end).replace(',','.')+'\n'+c.lines.map(l=>cleanPunctuation(l).replaceAll('&','&amp;').replaceAll('<','&lt;')).join('\n')).join('\n\n')+'\n';
 return {cues,mapping,srt,vtt,report:{version:1,maxLine,maxLines:2,maxDuration,sourceCues:aligned.length,displayCues:cues.length,fastCues:fast}};
}
function parseDisplay(text){return text.replace(/^\uFEFF/,'').trim().split(/\r?\n\s*\r?\n/).filter(Boolean).map(block=>{const lines=block.split(/\r?\n/),at=lines.findIndex(l=>l.includes(' --> '));if(at<0)throw Error('Legenda inválida.');const [a,b]=lines[at].split(' --> ');return {start:seconds(a),end:seconds(b),lines:lines.slice(at+1),text:normalized(lines.slice(at+1).join(' '))};});}
function validateDisplay(text,aligned){const cues=parseDisplay(text);if(cues.some(c=>c.lines.length>2||c.lines.some(l=>l.length>42)||c.end-c.start>6.002||c.end<=c.start))throw Error('A legenda excede os limites de leitura.');if(cues.some((c,i)=>i&&c.start<cues[i-1].end-.002))throw Error('Há legendas sobrepostas.');if(cleanPunctuation(normalized(cues.map(c=>c.text).join(' ')))!==cleanPunctuation(normalized(aligned.map(c=>c.text).join(' '))))throw Error('Palavras ausentes ou alteradas na divisão da legenda.');return {cues:cues.length,maxLine:Math.max(...cues.flatMap(c=>c.lines.map(l=>l.length))),maxLines:Math.max(...cues.map(c=>c.lines.length)),maxDuration:Math.max(...cues.map(c=>c.end-c.start))};}
function write(file,text){if(fs.existsSync(file)&&fs.readFileSync(file,'utf8')===text)return;if(fs.existsSync(file))fs.copyFileSync(file,file+'.before-readable-'+Date.now());fs.writeFileSync(file+'.readable.tmp',text);fs.renameSync(file+'.readable.tmp',file);}
module.exports={normalized,wrap,formatCaptions,parseDisplay,validateDisplay,write};
