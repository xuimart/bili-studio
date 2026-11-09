# Desenvolvimento

## Preparar o checkout

Windows x64 e Node.js 22.12 ou superior. Git e npm são usados apenas para desenvolvimento.

```powershell
git clone https://github.com/xuimart/bili-studio.git
cd bili-studio
npm ci
npm run setup
npm test
npm run test:formats
npm run desktop
```

`setup` baixa e verifica ferramentas oficiais em `bin/`, ignorado pelo Git. Não precisa de outro projeto Xuim Art ou caminhos existentes do autor. `npm start` é o servidor web para desenvolvimento; o produto inicia por `desktop/main.cjs` e tem janela própria.

## Construir

```powershell
npm run dist:dir
npm run test:desktop -- "release\win-unpacked\Bili Studio.exe"
npm run dist
npm run test:release
```

`dist:dir` cria o aplicativo sem instalador; `dist` cria NSIS x64, `latest.yml` e blockmap em `release/`. Não publica automaticamente. O runtime Electron acompanha o instalador; ferramentas de mídia e modelos são preparados no perfil do usuário.

O smoke test usa um perfil vazio em `data/desktop-smoke-*`, grava relatório e captura e não altera a biblioteca principal. No app empacotado, verifica também o preparo de FFmpeg/yt-dlp. Pode receber o caminho de um EXE instalado. Preserve o exit code dos comandos em pipelines de CI.

## Variáveis internas

| Variável | Uso |
| --- | --- |
| `BILI_DATA_DIR` | Dados graváveis do backend; configurada pelo desktop |
| `BILI_BIN_DIR` | Ferramentas de mídia |
| `BILI_CACHE_DIR` | Componentes e modelos graváveis |
| `BILI_DOWNLOAD_DIR` | Pasta padrão sugerida para novos usuários |
| `BILI_PORT` | Porta opcional do servidor web de desenvolvimento |
| `BILI_TEST_PROFILE` | Perfil isolado dos testes desktop |
| `BILI_LEGACY_DIR` | Pasta `data` da versão antiga, para migração assistida; não gravada no pacote |

## Testes

- `npm test`: contratos de fila/API, retomada, checkpoints, origem/sessão, links, tradução, legendas, atualização e importação. Inclui mídia real quando FFmpeg está presente.
- `npm run test:formats`: gera arquivos reais em vários contêineres/codecs, converte, decodifica, verifica quadros/duração/áudio e une todos. Relatório: `data/format-matrix-report.json`.
- `npm run test:desktop`: janela Electron isolada; exige estado autenticado da API, controles, pasta preenchida e Node indisponível no renderer.
- `npm run test:layout`: renderer real com bibliotecas sintéticas concluídas, pendentes, falhas e execução. Confere posição da seleção, histórico recolhido, preservação de abertura durante polling e acesso à entrada de vários links. Não acessa a biblioteca pessoal.
- `npm run test:release`: inspeciona o ASAR, ausência de dados pessoais/componentes locais, versão, manifesto e hashes do instalador.
- `node scripts/verify-bilibili-live.cjs <URLs>`: teste externo opcional. A disponibilidade da plataforma pode falhar independentemente do código. Não exige cookies pessoais na CI pública.

Testes sintéticos verificam o pipeline local. Reconhecer um padrão de URL com fixtures não comprova acesso a todo conteúdo real daquele tipo. Registre separadamente falhas da plataforma.

## Contribuir

Crie branches `codex/<assunto>` e abra PRs. Altere versões e documentação junto com o comportamento. Nunca adicione `data/`, `downloads/`, `bin/`, cookies, `.env`, chaves, tokens ou capturas da biblioteca pessoal. Use fixtures públicas ou seus próprios vídeos autorizados.

## Recuperar tradução local

Com os trabalhos do aplicativo parados, execute `node scripts/recover-portuguese.cjs <export-id>` para um resultado unido. Por padrão, lê o perfil do usuário em `%LOCALAPPDATA%\Bili Studio`; `BILI_RECOVERY_PROFILE` permite escolher um perfil isolado. Vídeo e transcrição são reaproveitados, o progresso fica em `portuguese-recovery-status.json` e o resultado validado fica em `subtitle-repairs/`. A versão 4.0.3 importa a recuperação quando estiver ociosa ou na próxima abertura. Preserve o perfil antes de manutenção; não rode dois tradutores sobre o mesmo resultado. O script não controla janelas nem inicia downloads de vídeos.
