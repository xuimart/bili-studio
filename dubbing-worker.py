"""Local TTS worker. Original Bili Studio code; uses the public OmniVoice API."""
import os,sys,json,time,pathlib,hashlib,wave,platform
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
if not anchor.exists():
    emit(phase='Preparando voz sintética em português',progress=0)
    generated=model.generate(text=anchor_text,language='Portuguese',instruct=voice+', middle-aged, moderate pitch',num_step=32,speed=1.0)[0];sf.write(str(anchor),array(generated),sr,subtype='PCM_16')
prompt=model.create_voice_clone_prompt(ref_audio=str(anchor),ref_text=anchor_text)
load_seconds=time.monotonic()-begin;hardware=device+':'+(torch.cuda.get_device_name(0) if device=='cuda' else platform.processor())
segments=request['segments'];results=[];total=sum(s['end']-s['start'] for s in segments);complete=0;synthesis_seconds=0;measured_speech=0
for index,segment in enumerate(segments):
    duration=segment['end']-segment['start'];expected=round(segment['end']*sr)-round(segment['start']*sr);key=hashlib.sha256(json.dumps([request['engine'],segment['text'],duration,expected,voice,request['modelRevision']],ensure_ascii=False).encode()).hexdigest()[:20];output=work/(key+'.wav');cached=output.exists() and request.get('mode')!='benchmark'
    emit(phase=f'Gerando voz em português · {index+1} de {len(segments)}',progress=complete/total*100,completedSpeechSeconds=complete,totalSpeechSeconds=total,synthesisSeconds=synthesis_seconds,measuredSpeechSeconds=measured_speech)
    started=time.monotonic()
    if cached:audio,rate=sf.read(str(output),dtype='float32');assert rate==sr
    else:
        torch.manual_seed(2026+index)
        audio=array(model.generate(text=segment['text'],language='Portuguese',voice_clone_prompt=prompt,duration=duration,num_step=32,postprocess_output=False)[0])
        padding=round(sr*.1)
        if len(audio)>expected and len(audio)>padding*2 and np.max(np.abs(audio[:padding]))<.000001 and np.max(np.abs(audio[-padding:]))<.000001:audio=audio[padding:-padding]
        if abs(len(audio)-expected)>sr*.12:
            sf.write(str(work/'duration-review.wav'),audio,sr,subtype='PCM_16')
            raise RuntimeError(f'O motor entregou {len(audio)/sr:.3f}s para uma fala de {duration:.3f}s. O trecho foi preservado para revisão.')
        audio=np.pad(audio,(0,max(0,expected-len(audio))))[:expected]
        if not np.isfinite(audio).all() or np.sqrt(np.mean(audio*audio))<.0001:raise RuntimeError('O motor gerou uma fala silenciosa ou inválida.')
        ramp=min(round(sr*.01),len(audio)//2);audio[:ramp]*=np.linspace(0,1,ramp);audio[-ramp:]*=np.linspace(1,0,ramp)
        rms=float(np.sqrt(np.mean(audio*audio)));audio*=min(.07943/max(rms,.0001),.88/max(float(np.max(np.abs(audio))),.0001));sf.write(str(output)+'.tmp.wav',audio,sr,subtype='PCM_16');os.replace(str(output)+'.tmp.wav',output)
    elapsed=time.monotonic()-started
    if not cached:synthesis_seconds+=elapsed;measured_speech+=duration
    complete+=duration;results.append({**segment,'file':str(output),'actualDuration':len(audio)/sr,'synthesisSeconds':elapsed,'cached':cached})
    (work/'checkpoint.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
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
result=dict(audio=str(timeline),sampleRate=sr,segments=results,loadSeconds=load_seconds,preparationSeconds=preparation_seconds,synthesisSeconds=synthesis_seconds,speechSeconds=total,measuredSpeechSeconds=measured_speech,hardware=hardware,engine=request['engine'],voice=voice,completedAt=time.time())
(work/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');emit(result=result)
