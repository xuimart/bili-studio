# Arquitetura e persistência

## Aplicativo

O processo principal do Electron cria uma `BrowserWindow` própria e inicia o backend Node local. O runtime é incluído no instalador. O usuário não depende de Node, Python, Edge ou de um serviço hospedado. A interface usa Chromium incorporado ao aplicativo; não é uma interface Win32 escrita em C++.

O backend escuta exclusivamente em `127.0.0.1`, em porta aleatória no desktop. Usa cookie de sessão HttpOnly, SameSite=Strict, validação de Host e Origin e CSP. O renderer tem `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`, permissões negadas e navegação externa restrita. Não há ponte IPC que exponha shell ou sistema de arquivos ao renderer. Diálogos nativos são chamados pelo backend através de uma função injetada pelo processo principal.

## Módulos

| Arquivo | Responsabilidade |
| --- | --- |
| `desktop/main.cjs` | Janela, menu, bandeja, diretórios, diálogos, suspensão e atualizações |
| `desktop/update-policy.cjs` | Bloqueio de instalação durante trabalhos e destinos externos permitidos |
| `runtime-paths.cjs` | Separação entre fontes, dados graváveis, componentes e downloads |
| `runtime-tools.cjs` | Instalação de ferramentas oficiais com SHA-256, retentativas e fontes alternativas do distribuidor FFmpeg |
| `server.cjs` | API, seleção, fila persistente, retomada e coordenação do processamento |
| `library.cjs` | Normalização de URLs, redirecionamentos b23, descoberta de partes/coleções e adaptador yt-dlp |
| `fast-download.cjs` | Download por ranges, backups de CDN e prefixo contíguo retomável; fallback para yt-dlp |
| `media.cjs` | ffprobe, validação, MP4 H.264/AAC, tone mapping HDR, união e capítulos |
| `speech.cjs` / `whisper.cjs` | Detecção por amostras, reconhecimento em chunks e preparação de modelos |
| `translate.cjs` / `ollama-transport.cjs` | Tradução local, validação de JSON/texto, retries e checkpoints |
| `subtitle-delivery.cjs` | Disponibilidade de legenda, importação de recuperação validada e organização de fontes/alinhamentos |
| `captions.cjs` / `caption-compact.cjs` | Divisão, linhas, duração e compacidade da legenda de exibição |
| `state-store.cjs` | Snapshots temporários, salvamento recuperável e tolerância a arquivo bloqueado |

## Fluxo

Link → descoberta → seleção → fila → faixas de mídia → MKV intermediário → MP4 H.264/AAC verificado → união opcional → detecção/transcrição opcional → tradução opcional → SRT/VTT de exibição.

MKV é intermediário para aceitar combinações de codecs que não cabem de forma confiável em MP4. Vídeo H.264 de 8 bits e áudio AAC são copiados quando compatíveis. HEVC, AV1, FLV1 e demais codecs são convertidos somente para o arquivo final de reprodução. HDR PQ/HLG usa tone mapping para SDR. Os metadados avançados de Dolby Vision não são preservados.

## Diretórios

- Programa: normalmente `%LOCALAPPDATA%\Programs\Bili Studio`, configurável no instalador.
- Dados: `%LOCALAPPDATA%\Bili Studio`.
- Estado: `state.json`; snapshots recuperáveis em `state.json.tmp`.
- Componentes: `components/tools`, `components/whisper`, `components/models`, `components/ollama`.
- Modelos Ollama: diretório padrão do próprio Ollama (`%USERPROFILE%\.ollama`), a menos que o ambiente já configure outro.
- Arquivos finais: pasta escolhida pelo usuário, por biblioteca.
- Temporários/reconhecimento/união: subpastas `work` no diretório de dados e `.em-andamento` na biblioteca de destino.

Atualizações e desinstalação não removem os dados do perfil nem os vídeos. Não modificar appId, nome do aplicativo, diretórios ou política de dados numa release sem preparar migração. Importações guardam o estado anterior e só são aplicadas na próxima abertura. Novos campos no estado devem ser opcionais e manter compatibilidade com os estados anteriores.

## Tradução

Ollama usa uma instância local em `127.0.0.1:11435`, sem alterar a configuração do serviço padrão em `11434`. Modelos instalados são reutilizados; o primeiro preparo automático usa Qwen2.5 3B. A tradução valida caracteres latinos, IDs, completude de JSON e repetições. Quatro workers usam contexto fixo e transporte HTTP com conexões novas e recuperação limitada. A transcrição e a tradução completas não são substituídas pela versão concisa de exibição.

## Limites

O Bilibili pode mudar páginas, APIs, autenticação e CDN. O yt-dlp é preparado de uma release oficial no primeiro uso e fica fixo naquele perfil; não se autoatualiza silenciosamente durante downloads. Uma futura mudança do extrator deve ser validada e publicada, ou o componente deve ser preparado novamente com o aplicativo parado. Falhas da plataforma são diferentes de falhas de conversão local. Não há cloud para executar reconhecimento/tradução nem para guardar a biblioteca.

## Entrega e recuperação de legendas

A fonte transcrita fica em `subtitleSource`; `subtitles` publica somente um resultado concluído ou conserva a versão anterior. `subtitleDelivery` registra idioma solicitado e estado. O estado público inclui `subtitleReady`, `subtitleStatus` e `subtitleNotice`; a API recusa com 409 a transcrição original quando PT foi solicitado e ainda não está pronto.

`scripts/recover-portuguese.cjs` recupera um resultado unido em um perfil local. Usa checkpoint isolado por vídeo, valida completude/tempos/idioma/legibilidade e grava o SRT de reprodução e um registro em `subtitle-repairs/`. A importação confere ID, caminho, tamanho e modificação do vídeo, arquivos e alinhamento antes de atualizar somente esse resultado. Não aplica durante trabalho ativo. Registros aplicados ficam preservados; arquivos originais e alinhamentos são organizados sem apagar a fonte. O diretório é privado do perfil e nunca integra o instalador ou o Git.
