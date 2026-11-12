# Histórico

## 4.2.0 — 2026-11-12

- Dublagem local em português com motor independente, vozes sintéticas e tradução preparada quando necessária.
- Teste real de 30 segundos para estimar o tempo no computador da pessoa, com preparação inicial separada e atualização durante a voz.
- Detector de fala, frases menores e geração com duração controlada para melhorar o encaixe.
- Troca apenas o áudio do MP4, conserva imagem/capítulos e preserva a versão anterior. Checkpoints e recuperação de publicação interrompida.

## 4.1.2 — 2026-11-11

- PDF principal do sumário ao lado do MP4 e SRT, com nome da playlist e caracteres seguros para Windows.
- Sumário aceita poucos trechos instantâneos e pequenas sobras no fim de legendas antigas, sem modificar a fonte. Ajustes ficam registrados; grandes divergências continuam recusadas.
- Sumários válidos e checkpoints anteriores são reaproveitados.

## 4.1.1 — 2026-11-11

- Exporta sumário em PDF e HTML clicáveis, além do Markdown.
- Assunto e horário abrem o Bili Studio no vídeo e tempo correspondentes, mesmo quando o programa está fechado.
- Links usam o ID da biblioteca, sem caminhos pessoais nem tokens. Valida esquema, vídeo e tempo; não abre arquivos arbitrários.
- Documentos ficam em Arquivos de apoio e podem ser exportados de sumários existentes sem nova geração por IA.
- Verificados 100 links de um PDF real de 12 páginas e navegação no player pelo aplicativo empacotado.

## 4.1.0 — 2026-11-11

- Sumário por assuntos depois da união e da legenda: títulos, descrições e tempos reais, com navegação pelo player e download Markdown.
- Opção para desligar a geração automática e botão para gerar/retomar sumários de vídeos já prontos. Preserva o progresso por bloco, referências à legenda e o resultado anterior.
- Falha no sumário não invalida vídeo ou legenda; arquivos ficam em Arquivos de apoio.
- Corrige escolha de áudio quando a primeira faixa é silenciosa e a faixa padrão tem som, inclusive em conversão e união com padronização.
- Reconhece links sem protocolo de domínios permitidos e identificadores BV retornados pelo extrator; recusa partes inválidas.
- Matriz ampliada: 26 verificações de mídia, 10 consultas reais de links e uma amostra real de download com áudio. 136 testes automatizados.

## 4.0.4 — 2026-11-11

- A pasta da playlist deixa à vista o vídeo unido e seu SRT com o mesmo nome da playlist, sem nomes genéricos ou data no arquivo final.
- Episódios individuais ficam em **Episódios**. Transcrições, VTT, alinhamentos, checkpoints e versões anteriores ficam em **Arquivos de apoio**.
- Organiza bibliotecas anteriores quando o aplicativo está ocioso, sem reconverter vídeos. Atualiza os caminhos internos, preserva arquivos e registra movimentos recuperáveis.
- Protege nomes reservados do Windows, caracteres inválidos, Unicode e colisões de nomes; arquivos existentes nunca são sobrescritos.
- Mantém a proteção de PT-BR: legenda original não aparece como tradução concluída.

## 4.0.3 — 2026-11-09

- Tradução interrompida não entrega a transcrição original em mandarim como se a legenda PT estivesse pronta. Vídeo e legenda têm estados separados.
- Preserva a fonte e qualquer legenda portuguesa anterior até concluir a nova tradução. O player mostra o erro ou a pendência e não ativa a faixa errada.
- Restringe caracteres que quebravam o JSON gerado, valida checkpoints e retoma o prefixo válido sem repetir todo o trabalho.
- Detecta repetições dentro de um único trecho do Whisper e tenta outra segmentação antes de enviar o texto ao tradutor.
- Separa transcrições originais e alinhamentos completos dos SRT de exibição, reduzindo escolhas automáticas erradas dos players externos.
- Inclui recuperação local validada de tradução sem baixar ou unir os vídeos novamente; reaproveita legendas PT prontas.
- Corrige o idioma de destino na API de geração de legendas.
- 113 testes passaram; o teste de interface também confirma que uma tradução falha não cria faixa chinesa nem oferece download da legenda incorreta.

## 4.0.2 — 2026-11-09

- A seleção dos vídeos e as opções passam a aparecer imediatamente após o link e a pasta de destino.
- Playlists concluídas e seus arquivos ficam em um histórico recolhido, sem ocupar a fila de trabalhos atuais.
- Remove o painel grande de “fila concluída” e o acompanhamento antigo quando não há trabalho em andamento.
- Mantém pendentes, pausados e erros na fila; o atalho “Colar vários links” continua acessível junto ao campo de link.
- Evita duplicar o mesmo resultado unido no histórico. Nenhum arquivo ou registro salvo é apagado por essa organização visual.
- Teste com renderer real confirmou seleção com 15 vídeos, nove concluídos recolhidos, abertura do histórico preservada durante atualizações e visibilidade de pendentes/erros/execução.

## 4.0.1 — 2026-11-09

- Corrige a rejeição de links localizados com nome de escrita, como `/zh-Hans/video/` e `/zh-Hant/video/`.
- Valida o prefixo com o suporte BCP 47 do runtime, incluindo combinações de escrita/região e regiões numéricas, antes de consultar o vídeo canônico.
- Mantém a validação de host, HTTPS, identificador e estrutura do caminho. A análise continua trazendo todas as partes da biblioteca.
- 101 testes passaram, incluindo regressão com o endereço informado. Consulta real reconheceu seus 15 episódios; nenhum download foi iniciado por esse teste.

## 4.0.0 — 2026-11-09

Primeira distribuição pública instalável do Bili Studio.

- Janela própria Electron, menu Windows, bandeja, zoom e diálogos nativos; não depende de Edge ou Node instalado.
- Instalador NSIS por usuário e canal de atualizações GitHub Releases. Instalação de update bloqueada enquanto há trabalhos ativos.
- Dados, componentes e modelos separados da instalação; importação da biblioteca anterior com backup.
- Preparo automático de ferramentas oficiais e modelos, verificação SHA-256 e retentativas de erros temporários.
- Aceitação ampliada de links: BV/AV, páginas localizadas, b23, player, coleções/séries, favoritos, listas de autor, Bangumi e cursos acessíveis.
- MKV intermediário e saída MP4 H.264/AAC, com conversão seletiva, HDR/HLG para SDR, verificação de áudio e preservação de arquivos anteriores.
- Fila, retomada, união com capítulos, transcrição multilíngue e tradução local para PT-BR.
- Correções acumuladas de detecção de mandarim, tradução JSON, reconexão, checkpoints e legibilidade das legendas.
- Manual, arquitetura, compatibilidade, desenvolvimento, releases, licenças e workflows de CI/publicação.

### Limites conhecidos

Windows x64; distribuição sem Authenticode; componentes/modelos exigem internet na primeira preparação. Não contorna acesso, região, assinatura ou DRM. Lives, áudio sem vídeo e Bilibili.tv internacional não são suportados. Sincronização e tradução automática podem exigir revisão.
