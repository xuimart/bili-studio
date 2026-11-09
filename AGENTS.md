# Bili Studio

- Leia README, docs/ARQUITETURA.md e docs/RELEASES.md antes de alterar distribuição ou persistência.
- O produto é o aplicativo Electron; não substituir seu atalho por Edge/Chrome ou exigir Node instalado no computador do usuário.
- Dados, ferramentas e modelos devem ficar em diretórios graváveis do perfil, separados do app.asar. Não fixar caminhos pessoais.
- Nunca versionar `data`, `downloads`, `bin`, cookies, tokens, modelos, arquivos de mídia ou diagnósticos pessoais. Não apagar a biblioteca do usuário para testar.
- Preserve áudio e originais válidos. Em conversão, valide antes de substituir e guarde backup quando já existe outro arquivo final.
- Atualização não deve iniciar durante trabalhos nem instalar automaticamente ao sair. Preserve appId e dados entre versões.
- Use fixtures pequenas e perfis isolados para testes. Mudanças no pipeline exigem `npm test` e `npm run test:formats`; mudanças desktop/distribuição exigem smoke test empacotado e `npm run test:release`.
- Só declarar cobertura efetivamente exercitada. Distinguir fixtures, amostras reais, consulta externa e limitações da plataforma.
- Releases são autorizadas pelo responsável; preparar e verificar os artefatos antes de publicar. Código novo em branches `codex/<assunto>`.
- Não alterar os scripts ignorados da versão 3.8 nem os dados históricos sem necessidade explícita de migração ou recuperação.
