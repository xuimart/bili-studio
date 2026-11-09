# Releases e atualizações

## Canal estável

Repositório e releases públicos: `xuimart/bili-studio`. AppId estável: `br.com.xuimart.bilistudio`. Instalador NSIS por usuário, x64, sem administrador. Versão em `package.json` e `package-lock.json`. Tags como `v4.0.0`.

O `electron-updater` usa GitHub Releases. Não existe token GitHub dentro do aplicativo. A consulta é manual em Ajuda; download e instalação exigem ações do usuário. A instalação é bloqueada durante trabalhos e `autoInstallOnAppQuit=false` impede instalação surpresa ao fechar.

`latest.yml` contém SHA-512 do instalador e o blockmap permite downloads diferenciais. O transporte vem de HTTPS/GitHub. **Esta release não é assinada com Authenticode**: checksums não substituem identidade de editor. Para assinatura futura, configure certificado/serviço no CI, publisherName e verificação de assinatura. Nunca coloque certificados no Git.

## Publicação

1. Altere a versão com `npm version <patch|minor|major> --no-git-tag-version`.
2. Atualize changelog/documentação. Valide importação de estado antigo; faça backup antes de migrações.
3. Execute setup, testes, matriz de mídia, build e verificação do pacote. Teste o EXE empacotado e instalação num perfil separado.
4. Faça commit, envie a branch e revise o PR. Após integração em `main`, crie e envie uma tag que corresponda à versão.
5. O workflow `release.yml` reconstrói e publica instalador, blockmap, manifesto e checksums no mesmo release. Aguarde todos os assets antes de considerar a publicação completa.
6. Confira o caminho de atualização pelo aplicativo instalado. Evite editar uma release já distribuída; publique versão corrigida.

```powershell
git switch main
git pull --ff-only
git tag v4.0.1
git push origin v4.0.1
```

Para publicação manual autorizada com os arquivos previamente validados:

```powershell
gh release create v4.0.0 --verify-tag --title "Bili Studio 4.0.0" --notes-file docs/RELEASE-4.0.0.md "release/Bili-Studio-Setup-4.0.0-x64.exe" "release/Bili-Studio-Setup-4.0.0-x64.exe.blockmap" "release/latest.yml" "release/SHA256SUMS.txt"
```

## Recuperação e limites

Dados ficam fora da instalação; atualização e desinstalação preservam perfil e vídeos. Uma versão anterior pode ser instalada manualmente. Antes de retornar a uma versão que não entende um novo estado, restaure backup compatível de `state.json`. Rollback do programa não é restauração dos dados.

Não alterar appId, nome, diretórios ou política de dados sem migração. Não reduzir versão automaticamente pelo updater. O canal ainda não tem uma versão futura após a primeira release; uma consulta sem atualização é esperada. Registre separadamente consulta, download, integridade e instalação. Não declarar upgrade entre versões públicas sem executá-lo.
