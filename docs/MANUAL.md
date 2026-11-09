# Manual de uso

## Downloads e fila

Cole um link em **Link da playlist ou vídeo** e busque os episódios. A seleção começa com todos os episódios identificados. Escolha a pasta, a qualidade, os episódios e o resultado. **Adicionar seleção à fila** guarda essas opções para aquele trabalho. Na área de vários links, cole um endereço por linha e adicione-os; cada link mantém sua própria subpasta e opções.

**Iniciar fila** executa uma biblioteca de cada vez. A fila informa a biblioteca atual, a etapa, o progresso e os próximos trabalhos. **Pausar após o atual** não corta a operação em andamento. Pausar downloads preserva os arquivos parciais. Um trabalho com erro pode ser retomado, reaproveitando arquivos verificados e checkpoints.

Vídeo e áudio podem vir separados do Bilibili. O aplicativo baixa as faixas e entrega MP4 com H.264/AAC. Se a fonte usa outro codec, a conversão pode levar tempo; o progresso da conversão é mostrado. Arquivos sem vídeo ou sem faixa de áudio não são considerados concluídos. A verificação de volume usa uma amostra inicial, não prova que todas as falas do vídeo estão audíveis.

## Legendas

Em **Legenda automática**, escolha detecção automática do áudio ou o idioma conhecido. **Português (Brasil)** transcreve e traduz; **Manter idioma original** entrega a transcrição. O Whisper faz reconhecimento de fala e o Ollama faz a tradução. O modo automático usa várias amostras do vídeo. Se a confiança não for suficiente ou o áudio parecer multilíngue, o programa pede que você escolha o idioma principal.

Na primeira solicitação, o programa prepara o Whisper base (aproximadamente 148 MB) e, para mandarim, o small (aproximadamente 488 MB). A tradução prepara o Ollama e um modelo Qwen, cujo download pode consumir vários GB. O progresso dessa preparação aparece como parte do processamento. Downloads exigem conexão; o processamento posterior é local. O tempo depende da duração do áudio, CPU, RAM e GPU.

SRT e VTT ficam junto ao vídeo. A versão PT-BR de exibição usa até duas linhas de 42 caracteres, blocos de até seis segundos e reescrita mais concisa quando necessário. A versão `aligned.srt` preserva a tradução completa. A divisão de tempos dentro de um trecho reconhecido é automática e aproximada; não equivale a alinhamento de cada palavra. Nomes, conteúdo técnico, traduções e sincronização ainda podem precisar de revisão humana. Se o player já estiver aberto, recarregue a legenda ou reabra o vídeo.

## União

Ative **Juntar em um único vídeo** para criar um MP4 por biblioteca. A ordem segue os episódios selecionados. O programa usa cópia direta quando possível e normaliza somente o necessário quando áudio, dimensões ou taxas de quadros diferem. Verifica áudio e duração antes de concluir. Os episódios individuais permanecem disponíveis. Uma falha preserva originais e partes reaproveitáveis.

## Fechar, atualizar e recuperar

Durante um trabalho, fechar a janela oferece continuar em segundo plano, manter a janela aberta ou pausar e sair. A bandeja do Windows permite reabrir a janela. Enquanto há trabalho, o aplicativo solicita que o Windows não suspenda automaticamente a sessão; isso termina quando a fila fica inativa.

Use **Ajuda → Verificar atualizações**. O programa avisa quando existe nova versão; você escolhe baixar e instalar. A instalação é bloqueada enquanto há downloads, processamento, auditoria ou uma fila em execução. Nenhuma atualização é instalada automaticamente ao fechar. Configurações e biblioteca ficam em `%LOCALAPPDATA%\Bili Studio`, separados do programa. Os vídeos ficam na pasta escolhida.

Para trazer os dados da antiga versão que abria no Edge: **Arquivo → Importar biblioteca anterior**, selecione `data/state.json` da pasta antiga e reinicie o aplicativo. A importação mantém os caminhos dos vídeos e salva backup do estado atual. Não apague a pasta antiga antes de conferir sua biblioteca. Em outro computador, copie os vídeos e ajuste a pasta; caminhos absolutos do computador anterior não passam a existir automaticamente.

## Problemas comuns

- **Login, região, 403, 412, 429:** confirme o acesso no Bilibili, aguarde e tente novamente. Se necessário, escolha cookies Netscape da sua própria sessão nas opções de login. Não publique esse arquivo.
- **Sem som:** retome o episódio. O aplicativo verifica a presença da faixa de áudio; silêncio na fonte não pode ser corrigido inventando áudio.
- **Pouca memória:** feche aplicativos pesados. A tradução é mais exigente que o download. Modelos já instalados de 7B podem consumir mais RAM que o 3B preparado automaticamente.
- **Sem espaço:** libere espaço no disco dos vídeos e no disco do perfil. União e conversão usam arquivos temporários.
- **Primeiro uso interrompido:** abra novamente. Componentes incompletos não são aceitos sem validação de integridade.
- **Atualização indisponível:** baixe o instalador da release oficial e execute-o. Os dados ficam preservados.
- **Diagnóstico:** Ajuda → Abrir pasta de diagnóstico. Revise os arquivos antes de compartilhar: eles podem conter títulos, URLs e caminhos pessoais. Nunca inclua cookies ou `runtime.json` em um relatório público.

Esta primeira release não tem certificado Authenticode. O Windows pode mostrar aviso de editor desconhecido/SmartScreen. Baixe apenas da release oficial e confira o SHA-256 publicado. Certificação de assinatura será uma etapa separada de distribuição.
