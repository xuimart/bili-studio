const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const profile=path.resolve('data','updater-smoke-'+Date.now());fs.mkdirSync(profile,{recursive:true});
const r=spawnSync(require('electron'),['desktop/update-smoke.cjs'],{env:{...process.env,BILI_TEST_PROFILE:profile},windowsHide:true,encoding:'utf8',timeout:180000});
if(r.status!==0){console.error(r.stderr||r.stdout||r.error);process.exit(1);}console.log(fs.readFileSync(path.join(profile,'update-smoke.json'),'utf8'));console.log('Evidência: '+profile);
