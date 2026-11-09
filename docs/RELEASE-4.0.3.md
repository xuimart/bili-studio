Corrige a entrega de legendas quando a tradução para português é interrompida.

- O player não ativa a transcrição chinesa como se a tradução PT estivesse pronta.
- Mantém a fonte e uma legenda portuguesa anterior até a nova tradução terminar.
- Valida o JSON e os checkpoints; retoma o progresso preservado.
- Detecta repetições do Whisper dentro de um trecho e usa outra segmentação na tentativa de recuperação.
- Guarda fontes originais em **Legendas originais** e alinhamentos de consulta em **Dados da legenda**. O SRT junto ao MP4 é a versão de exibição.
- Reaproveita legendas portuguesas prontas e aceita o idioma de destino na API de geração.

**Validação:** 113 testes automatizados e 18 verificações de mídia passaram. O teste com o renderer confirma que uma falha de tradução não adiciona faixa chinesa nem oferece o SRT incorreto. Uma recuperação real concluiu 2.917 trechos, preservando os tempos da fonte e os limites de exibição de duas linhas/42 caracteres/seis segundos.

Inclui o layout da 4.0.2, com seleção de vídeos imediatamente abaixo do link e histórico recolhido, e a correção `/zh-Hans/` da 4.0.1.

Atualize quando não houver trabalhos em andamento. Biblioteca, arquivos e configurações são preservados. Windows x64; sem certificado Authenticode. [Manual](https://github.com/xuimart/bili-studio/blob/main/docs/MANUAL.md).
