# Compatibilidade e evidências — 4.0.0

Validado em **9 de novembro de 2026**, Windows 11 x64, Electron 45.2.3, FFmpeg 9.0.2. Os relatórios brutos ficam localmente em `data/`; não publicamos a biblioteca pessoal do usuário. Estes testes não certificam toda máquina, todo conteúdo ou futuras mudanças do Bilibili.

## Tipos de link

| Entrada | Cobertura nesta versão |
| --- | --- |
| Vídeo BV/AV, código BV/AV sozinho | Normalização e descoberta |
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

As fixtures verificam normalização, limites, redirecionamento seguro, mapeamento, ordem e falhas explícitas. **Não foi feito download real de um exemplo de cada tipo de link.** A consulta real cobriu as nove bibliotecas usadas pelo usuário: **9/9 responderam, totalizando 186 episódios identificados**. Os formatos disponibilizados incluíram AVC/H.264, HEVC e AV1. Isso comprova descoberta e inventário naquele momento, não a disponibilidade permanente de cada episódio.

Também foi baixado um episódio real de aproximadamente 19 segundos pelo novo fluxo: yt-dlp → MKV intermediário → MP4 H.264/AAC. Duração medida de 18,218 segundos e sinal de áudio confirmado.

## Matriz real de mídia

O teste gera arquivos reais com vídeo e sinal sonoro conhecido. Cada entrada passa pelo pipeline de conversão; o resultado é decodificado, contado e inspecionado.

| Entrada exercitada | Resultado |
| --- | --- |
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
| União dos 16 formatos convertidos | Passou |
| Rejeição de vídeo sem áudio e áudio sem vídeo | Passou |

**18/18 verificações.** Confirma estrutura, duração, contagem de quadros, decodificação e presença de sinal. Não é uma avaliação humana de fidelidade visual de HDR nem de preservação de metadados Dolby Vision. HDR/HLG é convertido para SDR; Dolby Vision não é preservado como tal.

## Outros testes

- **92 testes automatizados**, sem falhas ou skips na máquina de validação: fila, isolamento da API, partes, retomada, legendas, tradução, persistência, importação, seletor nativo, componentes e bloqueio de instalação durante trabalhos.
- App Electron empacotado em perfil vazio, fora da pasta de fontes: interface pronta e dados separados da instalação. O teste desktop também reproduz MP4 e decodifica AAC dentro do Chromium incorporado.
- Verificação do ASAR e manifesto: sem biblioteca, cookies, modelos, caminhos pessoais ou tokens no pacote; SHA-512 do instalador e SHA-256 dos assets conferidos.
- Atualizador exercitado com versão anterior simulada: consulta, download do NSIS real e rejeição de checksum incorreto. Esse teste não instala uma versão pública futura.
- Auditoria npm das dependências de produção: nenhum aviso reportado na data da verificação. Não equivale a garantia de segurança.

## Fora da cobertura

Lives em andamento; links de áudio sem vídeo; Bilibili.tv internacional; DRM; conteúdo removido, privado, bloqueado por região ou sem permissão; garantias de disponibilidade da plataforma; Windows ARM/32 bits, macOS e Linux. O instalador desta release é Windows x64. Windows 10 e outros hardwares não foram homologados em máquina física nesta rodada.

As amostras são curtas; não provam ausência de corrupção em todos os pontos de um vídeo de horas. A inspeção de volume normal usa uma amostra inicial. Reconhecimento/tradução continuam sujeitos a erros linguísticos. Recomendamos reportar um caso reproduzível com versão, tipo de link e mensagem, sem cookies ou dados de sessão.
