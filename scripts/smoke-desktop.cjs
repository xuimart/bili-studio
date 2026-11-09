const {spawnSync}=require('node:child_process'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),profile=path.join(root,'data','desktop-smoke-'+Date.now());
const executable=process.argv[2]||require('electron');
const packaged=!!process.argv[2];
const result=spawnSync(executable,packaged?['--smoke-test']:[root,'--smoke-test'],{cwd:root,env:{...process.env,BILI_TEST_PROFILE:profile},windowsHide:true,encoding:'utf8',timeout:1800000});
const report=path.join(profile,'desktop-smoke.json');
if(result.error||result.status!==0||!fs.existsSync(report)){console.error(result.error||result.stderr||'Smoke test não terminou.');if(fs.existsSync(path.join(profile,'startup-error.txt')))console.error(fs.readFileSync(path.join(profile,'startup-error.txt'),'utf8'));process.exit(1);}
console.log(fs.readFileSync(report,'utf8'));console.log('Evidência: '+report);
