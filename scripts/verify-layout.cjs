const {spawnSync}=require('node:child_process');
const r=spawnSync(require('electron'),['desktop/layout-smoke.cjs'],{windowsHide:true,encoding:'utf8',timeout:60000});
console.log(r.stdout);if(r.status!==0){console.error(r.stderr||r.error);process.exit(1);}
