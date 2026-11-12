"""Local TTS worker. Original Bili Studio code; uses the public OmniVoice API."""
import os,sys,json,time,pathlib,hashlib,wave,platform,subprocess,shutil
request=json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
if os.environ.get('BILI_TEST_TTS_PROJECT'):sys.path.insert(0,os.environ['BILI_TEST_TTS_PROJECT'])
os.environ['HF_HOME']=request['cache'];os.environ['HF_HUB_CACHE']=request['cache'];os.environ['TOKENIZERS_PARALLELISM']='false'
def emit(**data):print('@@DUB@@'+json.dumps(data,ensure_ascii=False),flush=True)
emit(phase='Carregando o motor de voz · preparação fora da estimativa',progress=0)
import numpy as np,torch,soundfile as sf
torch.set_num_threads(min(6,os.cpu_count() or 2))
if request.get('mode')=='detect':
    from silero_vad import load_silero_vad,VADIterator
    iterator=VADIterator(load_silero_vad(),threshold=.5,sampling_rate=16000,min_silence_duration_ms=350,speech_pad_ms=80)
    speech=[];start=None;elapsed=time.monotonic()
    with wave.open(request['input'],'rb') as stream:
        assert stream.getframerate()==16000 and stream.getnchannels()==1 and stream.getsampwidth()==2
        while True:
            data=stream.readframes(512)
            if not data:break
            chunk=np.frombuffer(data,dtype=np.int16).astype(np.float32)/32768;chunk=np.pad(chunk,(0,512-len(chunk)))
            event=iterator(torch.from_numpy(chunk),return_seconds=True)
            if event and 'start' in event:start=max(0,event['start'])
            if event and 'end' in event and start is not None:speech.append({'start':start,'end':min(request['duration'],event['end'])});start=None
    if start is not None:speech.append({'start':start,'end':request['duration']})
    while len(speech)>1 and speech[0]['end']-speech[0]['start']<.65 and speech[1]['start']-speech[0]['end']>=1:speech.pop(0)
    pauses=[];position=0
    for interval in speech:
        if interval['start']>position:pauses.append({'start':position,'end':interval['start']})
        position=interval['end']
    if position<request['duration']:pauses.append({'start':position,'end':request['duration']})
    emit(result={'pauses':pauses,'speech':speech,'detector':'silero-vad-6.2.3-v2','seconds':time.monotonic()-elapsed});sys.exit(0)
from huggingface_hub import snapshot_download
from omnivoice import OmniVoice
torch.set_num_threads(min(6,os.cpu_count() or 2));torch.manual_seed(42)
begin=time.monotonic();device='cuda' if torch.cuda.is_available() else 'cpu'
try:checkpoint=snapshot_download('k2-fsa/OmniVoice',revision=request['modelRevision'],local_files_only=True)
except Exception:checkpoint=snapshot_download('k2-fsa/OmniVoice',revision=request['modelRevision'])
preparation_seconds=time.monotonic()-begin;begin=time.monotonic()
model=OmniVoice.from_pretrained(checkpoint,device_map=device,dtype=torch.float16 if device=='cuda' else torch.float32,load_asr=False)
work=pathlib.Path(request['work']);work.mkdir(parents=True,exist_ok=True);sr=model.sampling_rate
voice=request.get('voice','male');anchor=pathlib.Path(request.get('anchor',str(work.parent/('voice-'+voice+'.wav'))))
anchor_text='Vamos observar a construção deste personagem. Primeiro, simplificamos as formas. Depois, ajustamos as proporções e refinamos os detalhes.'
def array(audio):return (audio.detach().cpu().float().numpy() if hasattr(audio,'detach') else np.asarray(audio)).reshape(-1).astype(np.float32)
def clean_pauses(audio,sr):
    """Trim quiet edges and only the excess of long synthetic internal gaps."""
    frame=max(1,round(sr*.02));rms=np.array([np.sqrt(np.mean(audio[i:i+frame]**2)) for i in range(0,len(audio),frame)])
    threshold=min(.003,max(.0001,float(np.max(np.abs(audio)))*.006));active=np.flatnonzero(rms>=threshold)
    if not len(active):raise RuntimeError('O motor gerou uma fala silenciosa.')
    first=max(0,int(active[0])*frame-round(sr*.06));last=min(len(audio),(int(active[-1])+1)*frame+round(sr*.08));edges=len(audio)-(last-first);audio=audio[first:last]
    rms=np.array([np.sqrt(np.mean(audio[i:i+frame]**2)) for i in range(0,len(audio),frame)]);ranges=[];start=None
    for i,quiet in enumerate(np.append(rms<threshold,False)):
        if quiet and start is None:start=i
        if not quiet and start is not None:
            if start>0 and i<len(rms) and (i-start)*frame>=sr*.9:ranges.append((start*frame+round(sr*.2),i*frame-round(sr*.2)))
            start=None
    pieces=[];position=0;removed=0
    for start,end in ranges:pieces.append(audio[position:start]);position=end;removed+=end-start
    pieces.append(audio[position:]);return np.concatenate(pieces),{'edgesSeconds':edges/sr,'internalSeconds':removed/sr,'internalGaps':len(ranges)}
def fit_bounds(segment,previous_end,next_start,duration,natural_seconds):
    start=segment['start'];end=segment['end']+min(1.0,max(0,next_start-segment['end']-.03));end=min(duration,end)
    earliest=max(0,start-1.0,min(start,previous_end+.03)) if previous_end is not None else start
    if natural_seconds>end-start:start=max(earliest,end-natural_seconds)
    return start,end
def regroup(segments,index):
    def compatible(a,b):return b['start']-a['end']<=2 and b['end']-a['start']<=24 and len((a['text']+' '+b['text']).split())<=80
    if index+1<len(segments) and compatible(segments[index],segments[index+1]):first=index
    elif index>0 and compatible(segments[index-1],segments[index]):first=index-1
    else:return None
    a,b=segments[first:first+2];segments[first:first+2]=[{**a,'end':b['end'],'text':a['text'].strip()+' '+b['text'].strip()}];return first
if not anchor.exists():
    emit(phase='Preparando voz sintética em português',progress=0)
    generated=model.generate(text=anchor_text,language='Portuguese',instruct=voice+', middle-aged, moderate pitch',num_step=32,speed=1.0)[0];sf.write(str(anchor),array(generated),sr,subtype='PCM_16')
prompt=model.create_voice_clone_prompt(ref_audio=str(anchor),ref_text=anchor_text);anchor_hash=hashlib.sha256(anchor.read_bytes()).hexdigest()
load_seconds=time.monotonic()-begin;hardware=device+':'+(torch.cuda.get_device_name(0) if device=='cuda' else platform.processor())
segments=[dict(s) for s in request['segments']];plan_file=work/'fit-plan.json';input_hash=hashlib.sha256(json.dumps(segments,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
try:
    saved=json.loads(plan_file.read_text(encoding='utf8'));candidate=saved['segments'];same_text=' '.join(s['text'] for s in candidate).split()==' '.join(s['text'] for s in segments).split()
    valid=candidate and all(s['start']>=0 and s['end']>s['start'] and s['end']<=request['duration']+.001 and (not i or s['start']>=candidate[i-1]['end']-.001) for i,s in enumerate(candidate))
    if saved['inputHash']==input_hash and same_text and valid:segments=candidate
except (OSError,ValueError,KeyError,TypeError):pass
results=[];total=sum(s['end']-s['start'] for s in segments);complete=0;synthesis_seconds=0;measured_speech=0;index=0
def retry_group():
    global index,complete,total,results,synthesis_seconds,measured_speech
    revised=regroup(segments,index)
    if revised is None:return False
    synthesis_seconds+=time.monotonic()-started
    measured_speech-=sum(r['plannedDuration'] for r in results[revised:] if not r['cached']);results=results[:revised];complete=sum(r['plannedDuration'] for r in results);total=sum(s['end']-s['start'] for s in segments);index=revised
    temp=plan_file.with_suffix('.tmp');temp.write_text(json.dumps({'inputHash':input_hash,'segments':segments},ensure_ascii=False),encoding='utf8');os.replace(temp,plan_file)
    (work/'checkpoint.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8');emit(phase='Reagrupando uma fala curta para caber com ritmo natural',progress=complete/total*100);return True
while index<len(segments):
    segment=segments[index]
    duration=segment['end']-segment['start'];expected=round(segment['end']*sr)-round(segment['start']*sr);key=hashlib.sha256(json.dumps([request['engine'],segment['text'],duration,expected,voice,request['modelRevision'],anchor_hash],ensure_ascii=False).encode()).hexdigest()[:20];output=work/(key+'.wav');cached=output.exists() and request.get('mode')!='benchmark'
    if not cached and request.get('previousWork') and request.get('mode')!='benchmark':
        previous=pathlib.Path(request['previousWork'])/(key+'.wav')
        if previous.is_file():
            shutil.copyfile(previous,output)
            if previous.with_suffix('.json').is_file():shutil.copyfile(previous.with_suffix('.json'),output.with_suffix('.json'))
            cached=True
    emit(phase=f'Gerando voz em português · {index+1} de {len(segments)}',progress=complete/total*100,completedSpeechSeconds=complete,totalSpeechSeconds=total,synthesisSeconds=synthesis_seconds,measuredSpeechSeconds=measured_speech)
    started=time.monotonic();tempo=1.0;adjustments={};rewrite=not cached
    if cached:
        audio,rate=sf.read(str(output),dtype='float32');assert rate==sr
        try:details=json.loads(output.with_suffix('.json').read_text());tempo=details['tempo'];adjustments=details['pauseAdjustments']
        except (OSError,ValueError,KeyError):pass
    else:
        torch.manual_seed(2026+index)
        audio=array(model.generate(text=segment['text'],language='Portuguese',voice_clone_prompt=prompt,speed=1.0,num_step=32,postprocess_output=False)[0])
        if not np.isfinite(audio).all() or np.sqrt(np.mean(audio*audio))<.0001:raise RuntimeError('O motor gerou uma fala silenciosa ou inválida.')
        audio,adjustments=clean_pauses(audio,sr)
    effective_start,maximum_end=fit_bounds(segment,results[-1]['actualEnd'] if results else None,segments[index+1]['start'] if index+1<len(segments) else request['duration'],request['duration'],len(audio)/sr)
    available=int(maximum_end*sr+1e-5)-round(effective_start*sr)
    if len(audio)>available:
            ratio=len(audio)/available
            if ratio*tempo>1.25:
                if retry_group():continue
                sf.write(str(work/'duration-review.wav'),audio,sr,subtype='PCM_16')
                raise RuntimeError(f'A fala em {segment["start"]:.2f}s não coube após aproveitar pausas e reagrupar frases. Revise a tradução desse trecho; o original foi preservado.')
            if not request.get('ffmpeg'):raise RuntimeError('FFmpeg não está disponível para encaixar a fala.')
            adjustment=min(1.25/tempo,ratio*1.03);tempo*=adjustment;rewrite=True;natural=work/'natural.tmp.wav';fitted=work/'fitted.tmp.wav';sf.write(str(natural),audio,sr,subtype='PCM_16')
            subprocess.run([request['ffmpeg'],'-v','error','-y','-i',str(natural),'-af',f'atempo={adjustment:.8f}','-ar',str(sr),'-ac','1',str(fitted)],check=True,capture_output=True,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
            audio,rate=sf.read(str(fitted),dtype='float32');assert rate==sr
            excess=len(audio)-available
            if 0<excess<=sr*.06 and np.sqrt(np.mean(audio[-excess:]**2))<.003:audio=audio[:-excess]
            if len(audio)>available:
                if retry_group():continue
                raise RuntimeError('A fala excedeu o intervalo após o ajuste; original preservado.')
    if rewrite:
        ramp=min(round(sr*.01),len(audio)//2);audio[:ramp]*=np.linspace(0,1,ramp);audio[-ramp:]*=np.linspace(1,0,ramp)
        rms=float(np.sqrt(np.mean(audio*audio)));audio*=min(.07943/max(rms,.0001),.88/max(float(np.max(np.abs(audio))),.0001));sf.write(str(output)+'.tmp.wav',audio,sr,subtype='PCM_16');os.replace(str(output)+'.tmp.wav',output)
        output.with_suffix('.json').write_text(json.dumps({'tempo':tempo,'pauseAdjustments':adjustments}),encoding='utf8')
    if len(audio)>available or not np.isfinite(audio).all() or np.sqrt(np.mean(audio*audio))<.0001:raise RuntimeError('Fala inválida no checkpoint; original preservado.')
    elapsed=time.monotonic()-started
    if not cached:synthesis_seconds+=elapsed;measured_speech+=duration
    complete+=duration;results.append({**segment,'originalStart':segment['start'],'start':effective_start,'plannedDuration':duration,'file':str(output),'actualDuration':len(audio)/sr,'actualEnd':effective_start+len(audio)/sr,'borrowedBefore':segment['start']-effective_start,'borrowedAfter':max(0,effective_start+len(audio)/sr-segment['end']),'tempo':tempo,'pauseAdjustments':adjustments,'synthesisSeconds':elapsed,'cached':cached})
    (work/'checkpoint.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    index+=1
timeline=work/'voice.wav';position=0;zeros=b'\0'*sr*2
with wave.open(str(timeline)+'.tmp','wb') as stream:
    stream.setnchannels(1);stream.setsampwidth(2);stream.setframerate(sr)
    for segment in results:
        start=round(segment['start']*sr)
        if start<position:raise RuntimeError('Falas sobrepostas no plano de dublagem.')
        missing=start-position
        while missing:count=min(missing,sr);stream.writeframesraw(zeros[:count*2]);missing-=count
        with wave.open(segment['file'],'rb') as source:data=source.readframes(source.getnframes());stream.writeframesraw(data);position=start+len(data)//2
    missing=round(request['duration']*sr)-position
    while missing>0:count=min(missing,sr);stream.writeframesraw(zeros[:count*2]);missing-=count
os.replace(str(timeline)+'.tmp',timeline)
result=dict(audio=str(timeline),sampleRate=sr,segments=results,fitVersion=2,loadSeconds=load_seconds,preparationSeconds=preparation_seconds,synthesisSeconds=synthesis_seconds,speechSeconds=total,measuredSpeechSeconds=measured_speech,hardware=hardware,engine=request['engine'],voice=voice,completedAt=time.time())
(work/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');emit(result=result)
