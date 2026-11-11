# Bili Studio

Aplicativo Windows para baixar bibliotecas do **Bilibili.com**, escolher episódios, organizar uma fila, unir vídeos e criar legendas em português com processamento local.

**[Baixar instalador](https://github.com/xuimart/bili-studio/releases/latest)** · [Manual](docs/MANUAL.md) · [Compatibilidade e testes](docs/COMPATIBILIDADE.md) · [Desenvolvimento](docs/DESENVOLVIMENTO.md) · [Publicar atualizações](docs/RELEASES.md)

## Instalar e usar

1. Baixe o arquivo `Bili-Studio-Setup-<versão>-x64.exe` na página de releases e execute o instalador.
2. Abra **Bili Studio** pelo menu Iniciar ou pelo atalho da área de trabalho. O aplicativo tem sua própria janela; não abre Edge ou outro navegador para funcionar.
3. Na primeira abertura, aguarde a preparação de FFmpeg e yt-dlp. Os downloads vêm dos distribuidores oficiais e são verificados por SHA-256.
4. Cole o link, escolha a pasta e marque os episódios. Ative legenda e/ou união conforme o resultado desejado. Você pode adicionar vários links à fila.

Não precisa instalar Node.js, Python, FFmpeg ou Ollama manualmente. As ferramentas de transcrição e tradução são preparadas quando você solicita a primeira legenda. Isso exige internet, espaço livre e tempo adicional. Depois de preparados, Whisper e Ollama processam o áudio no próprio computador.

## Requisitos

- Windows 10/11 de 64 bits; Windows 11 é a plataforma validada nesta release.
- Internet para baixar os vídeos, instalar componentes e consultar atualizações.
- 8 GB de RAM para começar; 16 GB recomendados para tradução local. Uma GPU é opcional.
- Espaço para os vídeos, arquivos temporários e modelos. A primeira preparação de tradução pode consumir vários GB. Deixe espaço adicional para unir ou converter os vídeos.
- Acesso ao conteúdo no Bilibili. Cookies da própria sessão podem ser necessários para conteúdo que exige login ou qualidade superior.

## O que entrega

- Vídeos MP4 com H.264 e AAC, conferidos antes de serem marcados como prontos.
- União na ordem selecionada, com capítulos e episódios individuais preservados.
- MP4 unido e SRT com o nome da playlist; episódios separados e arquivos de apoio organizados em subpastas.
- Legendas SRT/VTT, detecção de idioma e tradução local para PT-BR.
- Sumário automático por assuntos depois da união e da legenda, com tempos clicáveis e cópia Markdown em Arquivos de apoio.
- Legendas de exibição com até duas linhas de 42 caracteres e blocos de até seis segundos. A tradução completa fica preservada separadamente.
- Fila persistente, retomada de arquivos parciais e checkpoints de processamento.
- Atualizações pelo GitHub Releases, com instalação solicitada pelo usuário quando não há trabalhos em andamento.

Não existe garantia de compatibilidade com todo conteúdo futuro do Bilibili. A matriz distingue formatos testados, links reconhecidos e restrições de acesso. Lives em andamento, áudio sem vídeo, DRM e a plataforma internacional Bilibili.tv não fazem parte desta versão. Não contorna login, assinatura, região ou proteção de conteúdo.

## Seus dados

Configurações e fila ficam em `%LOCALAPPDATA%\Bili Studio`. Os vídeos ficam na pasta escolhida; a sugestão inicial é `Vídeos\Bili Studio`. Reinstalação e atualização preservam esses dados. A desinstalação também os mantém, para permitir recuperação.

Os vídeos, legendas, cookies, modelos, tokens de sessão, histórico pessoal e diagnósticos locais **não estão neste repositório nem no instalador**. Não há telemetria do Bili Studio. Downloads e atualizações fazem conexões aos seus respectivos fornecedores.

## Desenvolvimento

```powershell
npm ci
npm run setup
npm test
npm run test:formats
npm run desktop
npm run dist
```

Detalhes de arquitetura, importação da versão anterior, recuperação, dependências, segurança e releases estão em [docs](docs/ARQUITETURA.md).

Código do Bili Studio sob [licença MIT](LICENSE). Componentes externos mantêm suas próprias licenças: [avisos](THIRD-PARTY-NOTICES.md).
