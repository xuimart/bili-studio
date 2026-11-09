// Native tools are installed on the user's first launch, outside the read-only app.
// This preflight deliberately never copies this checkout's videos, models or credentials.
const fs=require('node:fs');
for(const file of ['desktop/main.cjs','desktop/icon.ico','public/index.html','runtime-tools.cjs'])if(!fs.existsSync(file))throw Error('Arquivo de distribuição ausente: '+file);
require('electron');
console.log('Fontes de distribuição prontas. Ferramentas oficiais serão verificadas por SHA-256 na primeira abertura.');
