# Componentes externos

A licença MIT do Bili Studio cobre seu próprio código. Não substitui as licenças dos componentes, modelos ou conteúdos baixados.

| Componente | Distribuição e licença |
| --- | --- |
| Electron / Chromium / Node.js | Runtime incluído no instalador. Electron e Node usam MIT; Chromium inclui licenças variadas. Os arquivos `LICENSE.electron.txt` e `LICENSES.chromium.html` acompanham a instalação. [Electron](https://github.com/electron/electron/blob/main/LICENSE) |
| electron-updater / electron-builder | Código/bibliotecas MIT. O builder é ferramenta de desenvolvimento. [Projeto](https://github.com/electron-userland/electron-builder) |
| OmniVoice | Código e pesos Apache-2.0, preparados separadamente para dublagem. O Bili Studio usa a API pública do pacote upstream; não distribui o código do VoiceStudio. [Código](https://github.com/k2-fsa/OmniVoice), [Pesos](https://huggingface.co/k2-fsa/OmniVoice) |
| Silero VAD | Detector de fala MIT, instalado como componente opcional de dublagem. [Projeto](https://github.com/snakers4/silero-vad) |
| uv / Python / PyTorch / Transformers | Preparados após a instalação para a dublagem. uv: MIT/Apache-2.0; Python: PSF; PyTorch: BSD; Transformers: Apache-2.0. Dependências mantêm suas licenças próprias nos pacotes instalados. [uv](https://github.com/astral-sh/uv), [Python](https://www.python.org/psf/license/), [PyTorch](https://github.com/pytorch/pytorch), [Transformers](https://github.com/huggingface/transformers) |
| NSIS | Sistema de instalação com componentes sob licenças próprias. [Licença](https://nsis.sourceforge.io/License) |
| FFmpeg / ffprobe | Baixados diretamente pelo aplicativo do distribuidor Gyan, depois da instalação; não incluídos no instalador Bili Studio. O pacote essentials é GPL e inclui componentes externos. A documentação/licenças do pacote ficam na pasta `components/tools/ffmpeg-package`. [Distribuidor, fontes e instruções](https://www.gyan.dev/ffmpeg/builds/), [FFmpeg](https://ffmpeg.org/legal.html) |
| yt-dlp | Baixado diretamente do GitHub oficial; SHA-256 verificado. O executável Windows inclui dependências com licenças adicionais. [Licenças e fontes](https://github.com/yt-dlp/yt-dlp/blob/master/LICENSE) |
| whisper.cpp / Whisper | Motor CPU baixado da release oficial b5454, com hash fixado no código. Modelos multilíngues base e small baixados do repositório ggerganov, com hashes fixados. [whisper.cpp](https://github.com/ggml-org/whisper.cpp), [Whisper MIT](https://github.com/openai/whisper/blob/main/LICENSE), [Modelos](https://huggingface.co/ggerganov/whisper.cpp) |
| Ollama | Runtime opcional baixado da release oficial, com SHA-256 do GitHub. MIT; inclui dependências com avisos próprios. [Ollama](https://github.com/ollama/ollama) |
| Qwen2.5 | Modelo de tradução obtido pelo Ollama. A preparação automática utiliza `qwen2.5:3b`; outras variantes já instaladas podem ser reutilizadas. As variantes têm licenças próprias: consulte o modelo antes de redistribuí-lo ou utilizá-lo comercialmente. O Bili Studio não inclui pesos de modelo no instalador. [Modelos e licenças](https://huggingface.co/Qwen) |

Os componentes nativos e modelos ficam fora da pasta de instalação, para persistirem entre versões. Conserve seus avisos se redistribuir um pacote modificado. Atualizações de fornecedores podem mudar disponibilidade, tamanho e termos.
