Primeiro instalador público do **Bili Studio para Windows x64**.

- Janela própria, sem abrir Edge e sem exigir Node/Python instalados.
- Links individuais e bibliotecas, seleção de episódios, pasta de destino e fila de vários links.
- MP4 com áudio, união por biblioteca e legendas automáticas em português.
- Detecção de idioma, checkpoints e legendas curtas de até duas linhas.
- Atualizações pelo GitHub em **Ajuda → Verificar atualizações**.
- Dados e vídeos preservados entre versões.

**Validação:** 92 testes automatizados; 18 verificações de mídia com conversão/decodificação; consulta real de nove bibliotecas com 186 episódios; download real curto com áudio; aplicação desktop e atualização com verificação de integridade. Consulte a [matriz e seus limites](https://github.com/xuimart/bili-studio/blob/main/docs/COMPATIBILIDADE.md).

Na primeira abertura, o programa baixa ferramentas oficiais de vídeo/áudio. A primeira legenda/tradução prepara modelos adicionais, que podem ocupar vários GB. Depois de preparados, transcrição e tradução rodam localmente.

O instalador não tem certificado Authenticode e pode apresentar aviso de editor desconhecido. Baixe deste repositório e confira `SHA256SUMS.txt`. Windows 11 x64 foi validado; outros sistemas/arquiteturas não foram homologados. Não contorna login, região, assinatura ou DRM.

Para importar a versão anterior: **Arquivo → Importar biblioteca anterior**, selecione o antigo `data/state.json` e reinicie. [Manual completo](https://github.com/xuimart/bili-studio/blob/main/docs/MANUAL.md).
