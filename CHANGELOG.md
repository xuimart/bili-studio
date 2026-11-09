# Histórico

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
