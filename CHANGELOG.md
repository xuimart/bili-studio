# Histórico

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
