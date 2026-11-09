Corrige a mensagem “Use o endereço de um vídeo dentro da playlist” em links válidos como:

`https://www.bilibili.com/zh-Hans/video/BV1Q3411772i/`

- Aceita `/zh-Hans/`, `/zh-Hant/`, `/zh-Hans-CN/` e outras tags de idioma/escrita/região estruturalmente válidas.
- Continua validando domínio, HTTPS, ID e caminho. Remove o prefixo de idioma e os rastreadores antes de consultar a biblioteca original.
- Preserva a seleção da biblioteca completa e as partes individuais.

**Validação:** 101 testes automatizados passaram. A consulta real do endereço acima reconheceu 15 vídeos e formatos com vídeo/áudio. O teste não iniciou downloads dos episódios.

Atualize por **Ajuda → Verificar atualizações**, ou execute o novo instalador. A atualização preserva biblioteca, vídeos, legendas e configurações. Aguarde os trabalhos em andamento terminarem antes de instalar.

Windows x64; instalador sem certificado Authenticode. As demais funcionalidades e limitações da versão 4.0.0 continuam valendo. Consulte o [manual](https://github.com/xuimart/bili-studio/blob/main/docs/MANUAL.md).
