# Arquitetura e persistência

## Aplicativo

O processo principal do Electron cria uma `BrowserWindow` própria e inicia o backend Node local. O runtime é incluído no instalador. O usuário não depende de Node, Python, Edge ou de um serviço hospedado. A interface usa Chromium incorporado ao aplicativo; não é uma interface Win32 escrita em C++.

O backend escuta exclusivamente em `127.0.0.1`, em porta aleatória no desktop. Usa cookie de sessão HttpOnly, SameSite=Strict, validação de Host e Origin e CSP. O renderer tem `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true` e navegação externa restrita. A política de permissões permite apenas `fullscreen` para a própria janela e origem local, com verificação de frame; pedidos automáticos e demais permissões permanecem negados. Não há ponte IPC que exponha shell ou sistema de arquivos ao renderer. Diálogos nativos são chamados pelo backend através de uma função injetada pelo processo principal.

## Módulos

| Arquivo | Responsabilidade |
| --- | --- |
| `desktop/main.cjs` | Janela, menu, bandeja, diretórios, diálogos, suspensão e atualizações |
| `desktop/update-policy.cjs` | Bloqueio de instalação durante trabalhos e destinos externos permitidos |
| `runtime-paths.cjs` | Separação entre fontes, dados graváveis, componentes e downloads |
| `runtime-tools.cjs` | Instalação de ferramentas oficiais com SHA-256, retentativas e fontes alternativas do distribuidor FFmpeg |
| `server.cjs` | API, seleção, fila persistente, retomada e coordenação do processamento |
| `lesson-delivery.cjs` | Entrega por aula, disponibilidade de reprodução e reaproveitamento validado |
| `library.cjs` | Normalização de URLs, redirecionamentos b23, descoberta de partes/coleções e adaptador yt-dlp |
| `fast-download.cjs` | Download por ranges, backups de CDN e prefixo contíguo retomável; fallback para yt-dlp |
| `media.cjs` | ffprobe, validação, MP4 H.264/AAC, tone mapping HDR, união e capítulos |
| `speech.cjs` / `whisper.cjs` | Detecção por amostras, reconhecimento em chunks e preparação de modelos |
| `translate.cjs` / `ollama-transport.cjs` | Tradução local, validação de JSON/texto, retries e checkpoints |
| `context-review.cjs` | Unidades de tradução com contexto, auditoria automática, dúvidas e correções humanas com histórico |
| `subtitle-delivery.cjs` | Disponibilidade de legenda, importação de recuperação validada e organização de fontes/alinhamentos |
| `library-files.cjs` | Nomes finais, episódios separados, arquivos de apoio, migração e diário de movimentos |
| `topic-summary.cjs` | Sumário por assuntos, referências verificadas, tempos da fonte e retomada por bloco |
| `summary-document.cjs` / `desktop/summary-pdf.cjs` | HTML sanitizado e impressão PDF pelo Electron incluído no produto |
| `desktop/deep-links.cjs` | Validação de links externos do sumário e argumentos de ativação |
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

Após uma união concluída, `library-files.cjs` mantém o MP4 final, seu SRT e o PDF principal do sumário na raiz da playlist. Individuais vão para `Episódios`; fontes, arquivos auxiliares e backups vão para `Arquivos de apoio`. A migração só roda ociosa e usa renomeação no mesmo volume, sem codificação. Todos os caminhos referenciados no estado são atualizados, incluindo histórico e checkpoint. O campo opcional `libraryRoot` mantém a raiz estável mesmo quando um arquivo está em subpasta. `playlistTitle` mantém o título sem o sufixo de quantidade de episódios.

Cada movimento é gravado antes da renomeação em `library-files-journal.json` no perfil. Na abertura, o diário reconcilia estado anterior quando origem está ausente e destino tem tamanho/modificação esperados. A primeira migração salva backup do estado. Colisões preservam ambos os arquivos; links simbólicos e destinos externos à biblioteca são recusados. Arquivos bloqueados permanecem onde estão e os avisos ficam em `fileOrganization.warnings`; outra passagem tenta novamente. Não apagar o diário para restaurar apenas um snapshot antigo. Para manutenção offline: feche o aplicativo e execute `node scripts/organize-library.cjs <pasta-do-perfil>`; o relatório fica no perfil. Nunca enviar perfil, diário ou relatório para o GitHub público.

Atualizações e desinstalação não removem os dados do perfil nem os vídeos. Não modificar appId, nome do aplicativo, diretórios ou política de dados numa release sem preparar migração. Importações guardam o estado anterior e só são aplicadas na próxima abertura. Novos campos no estado devem ser opcionais e manter compatibilidade com os estados anteriores.

## Tradução

### Entrega aula por aula

No workflow sem união, os downloads da seleção terminam antes do processamento. Depois, um único loop conclui transcrição/tradução e dublagem de cada item, na ordem selecionada. O progresso global combina índice da aula com a etapa corrente; `operation.completed` conta aulas preparadas. No modo unido, a união antecede esse loop e ele recebe apenas o resultado final.

`processingDelivery` é opcional, compatível com históricos anteriores. Registra opções, pendência/execução/conclusão/falha/pausa e snapshot de tamanho/modificação, hash da legenda completa e fingerprint da voz. O workflow só pula uma aula concluída se opções e snapshot continuarem compatíveis, com motor/voz atuais e arquivos de legenda presentes. Operações manuais de refazer continuam explícitas. Uma retomada não reprocessa aulas anteriores válidas.

O estado público fornece `playbackReady`, `playbackLabel` e eventual aviso da versão preservada. A API recusa mídia pendente/em alteração mesmo que o download já tenha terminado; falhas mantêm acesso à versão anterior com aviso. A UI oferece atalhos por episódio, histórico e seleção atual. Polling atualiza rótulos e progresso sem recarregar o player. Ao fechar a prévia, o renderer remove o `src` e libera a mídia. Se a aula aberta voltar ao processamento, fecha o player antes da publicação. Reproduzir uma aula pronta usa GET autenticado/range e não interfere na operação das outras.

Ollama usa uma instância local em `127.0.0.1:11435`, sem alterar a configuração do serviço padrão em `11434`. Modelos instalados são reutilizados; o primeiro preparo automático usa Qwen2.5 3B. A tradução valida caracteres latinos, IDs, completude de JSON e repetições. Quatro workers usam contexto fixo e transporte HTTP com conexões novas e recuperação limitada. A transcrição e a tradução completas não são substituídas pela versão concisa de exibição.

Com `contextReview` ligado (padrão das novas solicitações), `context-review.cjs` substitui a tradução isolada. Une continuações de até 12 segundos/180 caracteres, preservando a cobertura por `sourceIds` e os limites da fonte. As frases dos vizinhos não são enviadas à geração, evitando antecipá-las no tempo atual. A segunda passagem propõe substituições literais pequenas, conferidas estruturalmente e disponibilizadas no editor para aceite humano. Propostas inválidas viram avisos e preservam a tradução contextual; não bloqueiam a voz por sugestões de estilo. Um trecho original maior não é cortado artificialmente; a legenda de exibição continua limitada a duas linhas/6 segundos. Cada unidade é traduzida e depois auditada individualmente, em sequência, com vocabulário de até quatro vizinhos por lado, título e `translationContext` opcional. Prefere 7B instalado, usa contexto 8192 e não carrega quatro inferências simultâneas. Não promete alinhamento de palavras: a divisão de exibição dentro de cada unidade é proporcional ao texto.

O glossário de anatomia só é sugerido quando título/fonte têm evidência do assunto. As poucas hipóteses de homófonos exigem termos repetidos nas falas próximas; nunca alteram o SRT original. `context-progress.json` salva apenas blocos cujas duas passagens foram concluídas e validadas; a chave inclui versão, título/contexto, modelo e fonte. O cache legado não é usado nessa etapa. O relatório `context-review.json` registra fonte, leitura provável, antes/depois, dúvidas e IDs. Traduções revisadas passam apenas pela formatação determinística, evitando que a compactação volte a traduzir uma transcrição defeituosa.

`subtitles.review` opcional identifica versão, assinatura do contexto, arquivo de relatório, fingerprint e dúvidas. Entregas antigas sem revisão são refeitas quando ela é solicitada; mudar assunto invalida seu reaproveitamento. `/api/translation-review` autentica leitura do relatório e correções de português. POST bloqueia trabalho/fila/auditoria concorrentes, exige fingerprint atual e valida todos os IDs/textos antes de gravar. Cria novos arquivos em Arquivos de apoio/Revisões manuais, preserva legenda/fonte anteriores e registra a confirmação manual do trecho. Dúvidas exibem marcador explícito e bloqueiam síntese automática. Edição invalida a dublagem anterior e o sumário; nunca modifica o MP4. Esse processo reduz falhas, mas modelos ainda podem deixar erros sem sinalizar.

## Sumário

Depois de uma união com legenda, o fluxo pode chamar `generateSummary`. O modelo local recebe até 4.200 caracteres de parágrafos amostrados por bloco; capítulos e pausas longas delimitam os grupos, com máximo aproximado de oito minutos. O modelo gera somente rótulos, descrição e ID de referência. Tempos são derivados do SRT e limitados pela duração real do vídeo; a citação é copiada pelo programa e validada na fonte. Não interpreta imagens nem garante fronteiras semânticas exatas.

`topicSummary` publica o resultado completo; `topicSummaryStatus` e `topicSummaryError` registram o andamento e conservam um resultado anterior. Markdown/JSON/checkpoints ficam em Arquivos de apoio, com nome estável por exportação. Fingerprint inclui conteúdo, versão do algoritmo, duração e blocos. Cache inválido é refeito por bloco, sem descartar os outros. Falha automática mantém vídeo e legenda prontos; `/api/summary` permite geração/retomada e download. O renderer usa `textContent` e tempos numéricos do servidor para navegar no player.

### Documentos clicáveis

O instalador registra `bilistudio://watch/export-ID?t=segundos` em HKCU, sem administrador. O comando usa caminho e URI entre aspas, com separador `--` antes da URI. A remoção do protocolo só é feita quando o comando ainda pertence a esta instalação. O processo principal trata ativação inicial e `second-instance`, espera o renderer ficar pronto e chama navegação com ID/tempo serializados. O renderer busca exclusivamente resultados do próprio histórico, valida a duração real, carrega metadados e posiciona o player. URLs, caminhos e comandos arbitrários são recusados. A navegação não inicia downloads ou altera a fila.

PDFs são impressos por uma BrowserWindow oculta, com sandbox e sem Node; não dependem de Python ou software PDF instalado. O HTML escapa título e texto da legenda e não carrega recursos externos. Links de assuntos usam apenas protocolo, ID e tempo; não expõem caminhos ou sessão. Exportações simultâneas são serializadas por resultado. Documentos anteriores são preservados quando substituídos ou quando uma exportação falha. O GET autenticado `/api/summary?format=pdf|html|markdown` permite exportação tardia sem invocar o modelo.

## Dublagem local e estimativa

`dubbing.cjs` ancora falas na tradução completa, detecta entrada/saída de fala e agrupa continuações antes de dividir por pontuação. Evita terminar/iniciar divisões de segurança em palavras de ligação, sem dividir o texto em quantidades iguais de palavras. `dubbing-runtime.cjs` prepara uv verificado por SHA-256, Python isolado e principais dependências de versões fixadas no perfil. O worker Python é copiado para diretório gravável, pois Python não lê scripts dentro do ASAR. OmniVoice e Silero usam modelos locais; não há dependência de outro aplicativo de voz. Pesos OmniVoice fixados por revisão. CUDA é usada quando disponível; CPU é suportada.

`/api/dubbing/calibrate` gera 30 segundos reais por voz. Preparação/model loading ficam separados do fator de síntese. A medição identifica motor/modelo, computador, voz, dispositivo e data; a interface invalida incompatibilidades e apresenta intervalo, não prazo garantido. O restante durante a geração usa somente fala não recuperada de cache. `/api/dubbing` exige tradução portuguesa pronta; a opção da fila prepara a tradução antes.

O worker gera cada fala com `speed=1.0` e sem duração fixa. Analisa energia em quadros de 20 ms, apara bordas quietas e reduz somente o excedente de pausas internas de pelo menos 900 ms, conservando 400 ms. Respirações curtas e áudio de baixa intensidade acima do limiar adaptativo permanecem. Falas que excedem a janela passam por `atempo`, sem alteração do tom e com limite de 1,25; excessos maiores são recusados, sem truncar palavras. Silêncio remanescente fica após a frase, mantendo as próximas âncoras. Checkpoints registram duração real, ajuste de velocidade e silêncio removido; o fingerprint inclui motor, modelo, voz, texto, janela e hash da referência sintética. Mudança de motor invalida cache e calibração antigos.

O WAV é montado em streaming, evitando manter aulas inteiras na RAM. WAVs por fala têm escrita atômica. FFmpeg copia a imagem/capítulos e mapeia apenas o áudio novo. O arquivo temporário fica no mesmo volume do destino; verificação precede troca, com backup e rollback. `publish.json` recupera uma troca interrompida antes/depois da renomeação, verificando caminhos, tamanho e modificação. A versão limita arquivos a 24 horas e depende da qualidade da legenda; não realiza alinhamento semântico/labial perfeito.

Áudio vazio, não finito ou abaixo do limiar de energia recebe até três tentativas com sementes diferentes; o caminho normal conserva a semente anterior na primeira tentativa e o cache válido. Metadados do WAV registram tentativa e semente bem-sucedida. Cache inválido é regenerado antes de escrever a substituição atômica. Esgotar tentativas pode reagrupar com uma vizinha; erro final identifica o tempo da fala. Antes de sintetizar, o backend solicita `keep_alive:0` apenas para Qwen 3B/7B em `11435`, com timeout e cancelamento; não interfere no Ollama padrão.

No workflow de aulas separadas, erro por item registra `processingDelivery.error` e `operation.failedIds`, conserva o resultado anterior e passa à próxima aula. `operation.completed` conta somente entregas concluídas/reaproveitadas. Ao final, pendências deixam status de erro com contagem explícita; nova execução ignora as aulas já compatíveis. Cancelamento propaga imediatamente. União e operações manuais mantêm a interrupção por erro.

O encaixe adaptativo mede o WAV antes de decidir se uma fala cabe. Pode aproveitar até um segundo livre por borda, respeitando a fala anterior e a âncora da próxima, sem antecipar a primeira entrada. Se isso e o ajuste limitado de velocidade não bastarem, combina a fala com uma vizinha (intervalo de até dois segundos, bloco máximo de 36 segundos/120 palavras) e sintetiza novamente; pode voltar um bloco sem publicar áudio parcial. O plano é salvo atomicamente em `fit-plan.json`, com hash da entrada e validação de texto/tempos na retomada. O fingerprint de publicação inclui a versão do encaixe. Checkpoints da versão anterior só são importados quando o hash da fala, modelo, voz, referência e janela coincide. A montagem valida ausência de sobreposição. Conteúdo realmente excessivo ainda pede revisão da tradução.

## Limites

O Bilibili pode mudar páginas, APIs, autenticação e CDN. O yt-dlp é preparado de uma release oficial no primeiro uso e fica fixo naquele perfil; não se autoatualiza silenciosamente durante downloads. Uma futura mudança do extrator deve ser validada e publicada, ou o componente deve ser preparado novamente com o aplicativo parado. Falhas da plataforma são diferentes de falhas de conversão local. Não há cloud para executar reconhecimento/tradução nem para guardar a biblioteca.

## Entrega e recuperação de legendas

A fonte transcrita fica em `subtitleSource`; `subtitles` publica somente um resultado concluído ou conserva a versão anterior. `subtitleDelivery` registra idioma solicitado e estado. O estado público inclui `subtitleReady`, `subtitleStatus` e `subtitleNotice`; a API recusa com 409 a transcrição original quando PT foi solicitado e ainda não está pronto.

`scripts/recover-portuguese.cjs` recupera um resultado unido em um perfil local. Usa checkpoint isolado por vídeo, valida completude/tempos/idioma/legibilidade e grava o SRT de reprodução e um registro em `subtitle-repairs/`. A importação confere ID, caminho, tamanho e modificação do vídeo, arquivos e alinhamento antes de atualizar somente esse resultado. Não aplica durante trabalho ativo. Registros aplicados ficam preservados; arquivos originais e alinhamentos são organizados sem apagar a fonte. O diretório é privado do perfil e nunca integra o instalador ou o Git.

Na leitura de legendas antigas para o sumário, poucos trechos sem duração são omitidos e sobras de até dez segundos no fim são limitadas à duração real. Não altera a fonte; sourceAdjustments registra omissões e cortes. Excesso de omissões, tempos invertidos/negativos ou divergências maiores continuam recusados. O PDF principal usa nome seguro ao lado do MP4; os demais documentos e checkpoints ficam em Arquivos de apoio.

Trechos densos podem ser agrupados e redistribuídos em espaço livre entre frases, com deslocamento de até um segundo por borda e sem sobreposição. Quando ainda excedem a densidade aceita, o planejador indica o horário para revisão antes de iniciar a síntese. Ao gerar novas legendas ou sumários de um vídeo dublado, a mídia original preservada é usada como referência, mantendo idioma e cache de duração.
