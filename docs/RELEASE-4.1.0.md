Adiciona sumário por assuntos aos vídeos unidos com legenda.

- Ative **Gerar sumário por assuntos depois da legenda**. Após concluir a união e a legenda, o modelo local identifica títulos e descrições em português.
- Em **Assuntos e tempos**, clique num assunto para ir ao trecho. Bibliotecas anteriores também podem gerar/retomar o sumário ali, sem novo download ou transcrição.
- Markdown, JSON e checkpoints ficam em **Arquivos de apoio**, mantendo só MP4 e SRT na raiz.
- Os horários vêm da legenda e dos capítulos do vídeo. Referências de texto são conferidas na fonte; falhas preservam blocos válidos e não invalidam vídeo/legenda.
- Corrige a seleção da faixa de áudio padrão quando existem várias faixas, e aceita links sem `https://` nos domínios permitidos.

Validação: 136 testes automatizados e 26 verificações de mídia, teste de clique/seek no renderer e execução empacotada. Dez consultas reais do Bilibili responderam; uma amostra pública foi baixada, convertida e decodificada com áudio. Um vídeo de aproximadamente 11h41 gerou 100 blocos de sumário com referências válidas.

Sumários usam amostras de trechos contextualizados em blocos de até cerca de oito minutos, separados pelos capítulos e por pausas longas. São uma navegação automática, não uma revisão humana de todos os temas. Erros na legenda podem afetar assuntos; os limites são aproximações baseadas na fala. A cobertura de links/formatos e suas limitações estão em [Compatibilidade](https://github.com/xuimart/bili-studio/blob/main/docs/COMPATIBILIDADE.md).
