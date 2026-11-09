const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const {BIN_DIR,CACHE_DIR,MODEL_DIR}=require('./runtime-paths.cjs');
const ENGINE_URL = 'https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip';
const ENGINE_SHA = '6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb';
const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin';
const MODEL_SHA = '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe';
const ENGINE_DIR = path.join(CACHE_DIR,'whisper');
const MODEL = path.join(MODEL_DIR,'ggml-base.bin');
function findEngine(directory = fs.existsSync(path.join(BIN_DIR,'whisper'))?path.join(BIN_DIR,'whisper'):ENGINE_DIR) {
  if (!fs.existsSync(directory)) return null;
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    if (item.name === 'whisper-cli.exe') return path.join(directory, item.name);
    if (item.isDirectory()) { const found = findEngine(path.join(directory, item.name)); if (found) return found; }
  }
  return null;
}
async function download(url, target, expected, onProgress, signal) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Falha ao baixar Whisper: HTTP ${response.status}. Tente novamente.`);
  const total = Number(response.headers.get('content-length'));
  const hash = crypto.createHash('sha256'); let received = 0, last = 0;
  const file = await fs.promises.open(target + '.download', 'w');
  try {
    for await (const chunk of response.body) {
      signal?.throwIfAborted(); hash.update(chunk); await file.write(chunk); received += chunk.length;
      if (Date.now() - last > 300) { onProgress(total ? received / total : 0); last = Date.now(); }
    }
  } finally { await file.close(); }
  if (hash.digest('hex') !== expected) throw new Error('A verificação do download do Whisper falhou. Tente novamente.');
  fs.renameSync(target + '.download', target); onProgress(1);
}
async function ensureWhisper(onProgress = () => {}, signal) {
  let exe = findEngine();
  if (!exe) {
    const zip = path.join(CACHE_DIR,'whisper.zip');
    await download(ENGINE_URL, zip, ENGINE_SHA, p => onProgress({ phase: 'Instalando o Whisper', progress: p * 12 }), signal);
    fs.mkdirSync(ENGINE_DIR, { recursive: true });
    await new Promise((resolve, reject) => {
      const child = spawn('tar.exe', ['-xf', zip, '-C', ENGINE_DIR], { windowsHide: true, stdio: 'ignore', signal });
      child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error('Não foi possível preparar o Whisper.')));
    });
    exe = findEngine(); if (!exe) throw new Error('Executável do Whisper não encontrado no pacote.');
  }
  if (!fs.existsSync(MODEL) || fs.statSync(MODEL).size !== 147951465) {
    await download(MODEL_URL, MODEL, MODEL_SHA, p => onProgress({ phase: 'Baixando o modelo de voz · 148 MB', progress: 12 + p * 88 }), signal);
  }
  const gpuDir=path.join(BIN_DIR,'whisper-cuda');
  const gpu=fs.existsSync(path.join(gpuDir,'validated.json')) ? findEngine(gpuDir) : null;
  return { exe:gpu||exe, fallbackExe:exe, gpu:!!gpu, model: MODEL };
}
async function ensureSmallModel(update=()=>{},signal){
  const file=path.join(MODEL_DIR,'ggml-small.bin');
  if(!fs.existsSync(file)||fs.statSync(file).size!==487601967)await download('https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',file,'1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b',p=>update({phase:'Preparando reconhecimento de mandarim · 488 MB',progress:p*100}),signal);
  return file;
}
module.exports = { ensureWhisper, ensureSmallModel, findEngine, MODEL };
if (require.main === module) ensureWhisper(p => console.log(p.phase, Math.round(p.progress) + '%')).then(x => console.log(JSON.stringify(x))).catch(e => { console.error(e); process.exitCode = 1; });
