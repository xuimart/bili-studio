# Compatibilidade e evidências — 4.2.1

Validado em **12 de novembro de 2026**, Windows 11 x64, Electron 45.2.3, FFmpeg 9.0.2. Os relatórios brutos ficam localmente em `data/`; não publicamos a biblioteca pessoal do usuário. Estes testes não certificam toda máquina, todo conteúdo ou futuras mudanças do Bilibili.

## Tipos de link

| Entrada | Cobertura nesta versão |
| --- | --- |
| Vídeo BV/AV, código BV/AV sozinho | Normalização e descoberta |
| Domínios permitidos sem `https://` | Normalização com protocolo HTTPS; não aceita hosts externos |
| Página localizada `/pt/video/`, `/pt-BR/video/`, domínio móvel | Canonicalização para o vídeo original |
| Multipartes `?p=3` | A análise traz a biblioteca completa; cada parte mantém seu URL no download |
| Coleção UGC com seções | Expansão conhecida de episódios/partes, com deduplicação |
| Link curto `b23.tv` | Redirecionamentos limitados, com validação do destino a cada etapa |
| Player incorporado com BV/aid | Conversão para o endereço do vídeo |
| Coleções e séries de autor, formatos antigos e `/lists/ID?type=…` | Adaptador do yt-dlp |
| Perfil de vídeos do autor | Adaptador do yt-dlp; máximo de 1.000 vídeos por lista |
| Favoritos e medialist/list | Adaptador do yt-dlp; pode exigir cookies |
| Bangumi `ep`, `ss`, `md` | Adaptador do yt-dlp; depende de acesso/região/login |
| Cheese/cursos `ep` e `ss` | Adaptador do yt-dlp; depende de permissão/compra na plataforma |
| Publicação `t.bilibili.com` que aponta a vídeo | Adaptador do yt-dlp |

As fixtures verificam normalização, limites, redirecionamento seguro, mapeamento, ordem e falhas explícitas, incluindo IDs BV planos do extrator, domínios sem protocolo e partes inválidas. **Não foi feito download real de um exemplo de cada tipo de link.** Na rodada atual, **10/10 consultas reais responderam**: BV, AV, zh-Hans, PT-BR, domínio móvel, player incorporado, b23.tv, outra playlist, coleção do autor e Bangumi. Favoritos, séries, perfil e Cheese têm cobertura de adaptador/fixtures, sem novo download real nesta rodada. Isso comprova descoberta naquele momento, não disponibilidade permanente ou permissão de acesso.

Também foi baixado um episódio público curto pelo fluxo real: yt-dlp → MKV intermediário → MP4 H.264/AAC. Duração medida de 18,218 segundos, decodificação completa e sinal de áudio confirmado (pico −9,1 dB). Nenhum cookie foi usado. Os testes online são manuais (`npm run test:links:live` e `npm run test:download:live -- "<link público de até 30 segundos>"`); o CI usa fixtures para não depender da disponibilidade da plataforma.

## Matriz real de mídia

O teste gera arquivos reais com vídeo e sinal sonoro conhecido. Cada entrada passa pelo pipeline de conversão; o resultado é decodificado, contado e inspecionado.

| Entrada exercitada | Resultado |
| --- | --- |
| MP4 H.264/AAC em 29,97 fps | Passou |
| MKV H.264 10 bits/AAC | Passou |
| MOV H.264/PCM | Passou |
| MP4 H.264 4:4:4/AAC | Passou |
| AVI MPEG-4/MP3 | Passou |
| TS com timestamps iniciando em 12 segundos | Passou |
| MP4 H.264/AAC estéreo | Passou |
| MP4 fragmentado H.264/AAC mono | Passou |
| MP4 HEVC 8 bits/AAC | Passou |
| MKV HEVC 10 bits/FLAC | Passou |
| MP4 AV1/AAC | Passou |
| WebM VP9/Opus | Passou |
| WebM VP8/Vorbis | Passou |
| FLV H.264/AAC | Passou |
| FLV legado FLV1/MP3 | Passou |
| MPEG-TS H.264/AC3 | Passou |
| MKV H.264/E-AC3 5.1 | Passou |
| MP4 H.264/ALAC | Passou |
| HEVC HDR10 PQ → SDR | Passou |
| HEVC HLG → SDR | Passou |
| HLS com segmentos TS | Passou |
| DASH com segmentos fMP4 | Passou |
| União dos 22 formatos convertidos | Passou |
| Rejeição de vídeo sem áudio e áudio sem vídeo | Passou |
| Rejeição de arquivo inválido/truncado | Passou |
| Duas faixas de áudio, com a primeira silenciosa e a padrão com som | Passou após correção |

**26/26 verificações.** Confirma estrutura, duração, contagem de quadros, decodificação e presença de sinal. A nova amostra multifaixa reproduziu escolha incorreta do áudio; a correção passou também em testes de MKV/MP4 e união de originais com resoluções distintas. Não é uma avaliação humana de fidelidade visual de HDR nem de preservação de metadados Dolby Vision. HDR/HLG é convertido para SDR; Dolby Vision não é preservado como tal.

## Outros testes

- **150 testes automatizados**, sem falhas ou skips na máquina de validação: links, fila, isolamento da API, mídia, retomada, legendas, tradução, sumário, PDF/HTML, persistência, importação, seletor nativo, componentes e bloqueio de instalação durante trabalhos. Inclui leitura limitada de tempos legados e PDF principal ao lado do vídeo, com backups em Arquivos de apoio. Regressões de dublagem cobrem “por meio”, verbo/complemento e divisão em pontuação sem perder palavras.
- PDF real de 12 páginas: 100 anotações de link e 100 destinos únicos conferidos contra a fonte, sem caminhos pessoais no endereço. Revisão visual de páginas inicial, intermediária e final. O desktop testa recebimento do link, abertura da prévia e busca no player real, além da presença de link no PDF empacotado. A política de abertura de protocolos depende do leitor PDF; não foi homologado todo leitor disponível.
- Sumário real de aproximadamente 11h41 com 100 blocos. IDs e citações foram validados na legenda; tempos ficaram dentro do vídeo. O renderer testou clique/seek em vídeo real sintético. Isto não equivale a revisão humana integral da transcrição ou dos assuntos.
- App Electron empacotado em perfil vazio, fora da pasta de fontes: interface pronta e dados separados da instalação. O teste desktop também reproduz MP4 e decodifica AAC dentro do Chromium incorporado.
- Verificação do ASAR e manifesto: sem biblioteca, cookies, modelos, caminhos pessoais ou tokens no pacote; SHA-512 do instalador e SHA-256 dos assets conferidos.
- Atualizador exercitado com versão anterior simulada: consulta, download do NSIS real e rejeição de checksum incorreto. Esse teste não instala uma versão pública futura.
- Auditoria npm das dependências de produção: nenhum aviso reportado na data da verificação. Não equivale a garantia de segurança.

## Fora da cobertura

Lives em andamento; links de áudio sem vídeo; Bilibili.tv internacional; DRM; conteúdo removido, privado, bloqueado por região ou sem permissão; garantias de disponibilidade da plataforma; Windows ARM/32 bits, macOS e Linux. O instalador desta release é Windows x64. Windows 10 e outros hardwares não foram homologados em máquina física nesta rodada.

As amostras são curtas; não provam ausência de corrupção em todos os pontos de um vídeo de horas. A inspeção de volume normal usa uma amostra inicial. Reconhecimento/tradução continuam sujeitos a erros linguísticos. Recomendamos reportar um caso reproduzível com versão, tipo de link e mensagem, sem cookies ou dados de sessão.

## Dublagem e estimativa

Teste real em RTX 3060 12 GB: instalação independente de Python/OmniVoice, calibração de 30 segundos, vozes masculina e feminina em fixture com substituição do áudio e backup na 4.2.0. Duas prévias reais de 180 segundos, uma de origem mandarim e outra inglês, verificadas por decodificação, duração, áudio único em português e correspondência ao WAV sintético. Os originais permanecem intactos. As frases são ancoradas com detector de fala; não é prova de alinhamento semântico/labial perfeito. Os exemplos receberam revisão de texto.

Na correção 4.2.1, a mesma frase unificada foi sintetizada com duração fixa e com ritmo natural: a primeira apresentou 2,3 s quietos no início; a segunda não apresentou intervalo quieto de pelo menos 400 ms. Isso é uma medição de energia da amostra, não avaliação humana integral. Cinco testes Python independentes do modelo verificam preservação de fala, pausas curtas e áudio de baixa intensidade, remoção de silêncio excedente e recusa de saída silenciosa.

As duas prévias de 180 segundos foram regeneradas com o motor natural: decodificação completa, uma faixa PT, comparação com o WAV sintético e reconhecimento em português. Erro de palavras do reconhecimento automático: aproximadamente 2,8% e 3,7%; isso não substitui revisão humana. A expressão de regressão foi reconhecida inteira na mesma fala. A maior compressão usada nas amostras foi 1,20; nenhuma teve alongamento da voz para preencher tempo. Os arquivos de origem permaneceram intactos.

O planejador foi aplicado às 11 bibliotecas locais sem gerar dublagens completas: oito passaram e três indicaram trechos excessivamente densos/repetitivos para revisão. A calibração mede a voz no dispositivo real; o intervalo é projeção com margem e exclui preparação, download, transcrição e tradução. Não foi executada uma aula inteira de 1 a 12 horas nem uma matriz de GPUs/CPUs.
