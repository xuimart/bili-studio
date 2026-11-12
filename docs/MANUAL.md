# Manual de uso

## Downloads e fila

O fluxo principal é **link e pasta → seleção dos vídeos e opções**. A fila aparece depois da seleção e mostra trabalhos ativos, pendentes, pausados ou com erro. Os concluídos ficam no painel **Histórico e arquivos prontos**, inicialmente recolhido. Abra esse painel para acessar os resultados anteriores; recolher ou mover visualmente os itens não apaga os arquivos nem a fila salva. Para montar uma fila de vários endereços, use **Colar vários links** junto ao campo do link.

Cole um link em **Link da playlist ou vídeo** e busque os episódios. A seleção começa com todos os episódios identificados. Escolha a pasta, a qualidade, os episódios e o resultado. **Adicionar seleção à fila** guarda essas opções para aquele trabalho. Na área de vários links, cole um endereço por linha e adicione-os; cada link mantém sua própria subpasta e opções.

**Iniciar fila** executa uma biblioteca de cada vez. A fila informa a biblioteca atual, a etapa, o progresso e os próximos trabalhos. **Pausar após o atual** não corta a operação em andamento. Pausar downloads preserva os arquivos parciais. Um trabalho com erro pode ser retomado, reaproveitando arquivos verificados e checkpoints.

Vídeo e áudio podem vir separados do Bilibili. O aplicativo baixa as faixas e entrega MP4 com H.264/AAC. Se a fonte usa outro codec, a conversão pode levar tempo; o progresso da conversão é mostrado. Arquivos sem vídeo ou sem faixa de áudio não são considerados concluídos. A verificação de volume usa uma amostra inicial, não prova que todas as falas do vídeo estão audíveis.

## Legendas

Em **Legenda automática**, escolha detecção automática do áudio ou o idioma conhecido. **Português (Brasil)** transcreve e traduz; **Manter idioma original** entrega a transcrição. O Whisper faz reconhecimento de fala e o Ollama faz a tradução. O modo automático usa várias amostras do vídeo. Se a confiança não for suficiente ou o áudio parecer multilíngue, o programa pede que você escolha o idioma principal.

Na primeira solicitação, o programa prepara o Whisper base (aproximadamente 148 MB) e, para mandarim, o small (aproximadamente 488 MB). A tradução prepara o Ollama e um modelo Qwen, cujo download pode consumir vários GB. O progresso dessa preparação aparece como parte do processamento. Downloads exigem conexão; o processamento posterior é local. O tempo depende da duração do áudio, CPU, RAM e GPU.

O SRT de exibição fica junto ao vídeo, com o mesmo nome. VTT, TXT, transcrição de origem, alinhamentos completos, checkpoints e versões anteriores ficam em **Arquivos de apoio**. A versão PT-BR de exibição usa até duas linhas de 42 caracteres, blocos de até seis segundos e reescrita mais concisa quando necessário. A versão `aligned.srt` preserva a tradução completa. A divisão de tempos dentro de um trecho reconhecido é automática e aproximada; não equivale a alinhamento de cada palavra. Nomes, conteúdo técnico, traduções e sincronização ainda podem precisar de revisão humana. Se o player já estiver aberto, recarregue a legenda ou reabra o vídeo.

Se a tradução falhar, o vídeo pode estar pronto enquanto a legenda portuguesa ainda precisa ser retomada. O programa preserva a transcrição e mostra a pendência; não ativa a faixa chinesa no lugar do português. Retomar reaproveita o trabalho salvo. Uma legenda PT já pronta continua disponível enquanto uma nova tentativa é feita.

Se um player externo continuar mostrando chinês, selecione o SRT com o mesmo nome do MP4 ou recarregue a legenda. Players podem manter a faixa anterior em memória. Arquivos abertos podem adiar a organização das fontes; os originais são preservados e o programa tenta organizá-los de novo quando estiver ocioso.

## União

Ative **Juntar em um único vídeo** para criar um MP4 por biblioteca. A ordem segue os episódios selecionados. O programa usa cópia direta quando possível e normaliza somente o necessário quando áudio, dimensões ou taxas de quadros diferem. Verifica áudio e duração antes de concluir. Os episódios individuais permanecem disponíveis. Uma falha preserva originais e partes reaproveitáveis.

Depois da união, a pasta fica assim:

```text
Nome da playlist [identificador]/
  Nome da playlist.mp4
  Nome da playlist.srt
  Episódios/
    001 - Primeiro episódio.mp4
    002 - Segundo episódio.mp4
  Arquivos de apoio/
    Legendas originais/
    Dados da legenda/
    ...checkpoints e versões anteriores
```

Sem união, os episódios continuam sendo os arquivos principais; cada SRT acompanha seu MP4. O título é preservado, inclusive acentos e caracteres chineses. Caracteres proibidos pelo Windows são substituídos por `_`; nomes reservados e caminhos longos são ajustados. Colisões recebem um sufixo numérico sem sobrescrever arquivos existentes.

Bibliotecas antigas são organizadas automaticamente com o aplicativo ocioso. Os episódios, fontes e backups são movidos, não reconvertidos nem apagados, e os caminhos do histórico são atualizados. Feche o vídeo no player externo para liberar arquivos bloqueados. A organização usa um diário de movimentos e salva um backup de `state.json` no perfil; restaurar só um estado antigo não desfaz movimentos de arquivos.

## Sumário por assuntos

Com união e legenda ligadas, marque **Gerar sumário por assuntos depois da legenda**. O programa usa o modelo local já preparado para ler trechos da legenda, identificar assuntos e criar títulos/descrições em português. Pode desligar a opção se quiser apenas vídeo e legenda.

Abra **Histórico → Arquivos prontos → Assuntos e tempos** ou o botão **Assuntos e tempos** do resultado. Um clique no assunto busca seu horário no vídeo. **Baixar sumário** entrega Markdown; os arquivos de sumário e checkpoint ficam em **Arquivos de apoio**. Para vídeos anteriores, use **Gerar sumário**; em caso de falha, **Retomar sumário** preserva blocos válidos. O sumário não requer baixar ou transcrever o vídeo novamente.

Os horários são calculados da legenda, com separação por capítulo, pausa longa e blocos de até aproximadamente oito minutos. O modelo recebe amostras contextualizadas, não imagens do vídeo. O título e a descrição são automáticos; a referência textual é copiada e conferida na fonte. Erros de reconhecimento/tradução podem prejudicar a identificação do assunto. Não equivale a alinhamento semântico exato nem revisão humana de toda a aula.

Se a geração falhar, vídeo e legenda continuam prontos. Retome o sumário separadamente. A primeira geração pode precisar preparar o modelo local e levar tempo; blocos já concluídos são reutilizados.

### PDF e HTML clicáveis

Em **Assuntos e tempos**, use **PDF clicável** ou **HTML clicável**. O PDF principal fica ao lado do vídeo unido e da legenda, com o nome da playlist. HTML e fontes ficam em **Arquivos de apoio**. Clicar no título do assunto ou no horário abre o Bili Studio já no trecho escolhido. O aplicativo pode estar fechado: o instalador registra o protocolo `bilistudio` no Windows.

É preciso manter o aplicativo instalado e a biblioteca no mesmo perfil. O documento não contém o vídeo nem um caminho pessoal: os links usam o ID do vídeo no histórico. Renomeações feitas pelo programa mantêm o ID. Copiar apenas o PDF para outro computador não transfere os vídeos ou a biblioteca. Leitores PDF e navegadores podem pedir confirmação ou bloquear a abertura de aplicativos; não é necessário desativar proteções globais. Se seu leitor não abrir o link, use o HTML ou navegue por assuntos no aplicativo.

Uma exportação de sumário existente não executa o modelo de IA novamente. Falhas de exportação preservam o sumário, o PDF anterior e os vídeos.

## Dublagem em português

Ative **Dublar em português** no painel de resultado. A tradução em português é preparada quando necessária; o original fica preservado em **Arquivos de apoio / Versões anteriores**. O MP4 principal passa a conter somente a nova voz. A imagem e os capítulos são copiados, sem recodificar o vídeo. Para uma aula já pronta, abra sua prévia e use **Dublar este vídeo em português**. Comece por um vídeo curto e confira o resultado antes de processar aulas longas.

Escolha a voz e use **Testar velocidade neste computador**. O teste gera 30 segundos de fala e salva a medição por voz e computador. A faixa exibida estima a geração de voz e montagem, com margem para variação. Download, transcrição, tradução e preparação inicial são etapas separadas. Durante a síntese, o restante é ajustado pelas falas efetivamente geradas; em retomadas, trechos de cache não são usados para fingir uma velocidade maior.

Na primeira vez, o aplicativo prepara Python, OmniVoice, PyTorch e os modelos no próprio perfil. Isso pode baixar vários GB. Não exige outro programa de voz instalado. Depois da preparação, a geração funciona localmente. GPU NVIDIA compatível pode acelerar; o teste registra o dispositivo realmente usado.

O encaixe usa os tempos da legenda, detecção de fala e duração controlada por frase. Legendas com tempos ou termos incorretos prejudicam o resultado. Falas densas demais para o intervalo são recusadas para revisão. A voz é sintética; não copia a voz do professor. A dublagem remove música/ruídos junto com o áudio anterior e não realiza sincronização labial.

Pode cancelar e retomar: falas concluídas ficam em checkpoint. O programa verifica o MP4 antes de substituir, preserva a versão anterior e mantém um diário para recuperar uma publicação interrompida. Limite desta versão: 24 horas por arquivo.

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
