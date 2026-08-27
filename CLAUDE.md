# CLAUDE.md

Portfólio pessoal no formato de um terminal Unix simulado. Não tem UI — tem um
shell, e o site inteiro se navega por comandos.

**`DESIGN.md` é a fonte da verdade.** Conceito, decisões fechadas, escopo,
arquitetura, mapa do repositório e plano de fases estão lá. Leia antes de propor
mudança de rumo, e atualize quando uma decisão mudar — o documento acompanha o
código no mesmo commit.

## Comandos

```
npm run dev       vite, com o manifesto regenerado antes
npm run build     tsc --noEmit && vite build → dist/
npm test          78 smoke tests headless (esbuild + node, sem navegador)
npm run fs        regenera src/generated/manifest.json
```

`npm run build && npm test` antes de considerar qualquer coisa pronta.

A API é um serviço à parte, em `api/` (FastAPI). Para desenvolver:

```
python3 -m venv .venv && .venv/bin/pip install -r api/requirements.txt
.venv/bin/python -m uvicorn api.main:app --port 8000
```

O Vite faz proxy de `/api` para a porta 8000; em produção quem junta as duas
coisas na mesma origem é o nginx (`deploy/nginx.conf`).

Recompilar o DOOM é outra história: `./wasm/fetch-sources.sh && ./wasm/build.sh`,
e precisa do emsdk. **Não** é necessário para rodar nem para fazer deploy — os
artefatos vivem versionados em `public/doom/`.

## Idioma

- Código, identificadores, saída do terminal e mensagens de commit: **inglês**.
- Comentários e documentação: **português**.
- Comentário explica *por quê*. O *o quê* já está no código.

## Git

- **Não commitar sem pedido explícito.** Faça, builde, teste, pare. Commit não
  solicitado infla o histórico.
- Conventional commits em inglês, um commit por escopo.
- Nenhuma menção a IA na mensagem.
- Identidade `OLuizFernando <luizfernandodematoscarvalho@gmail.com>`, definida
  **localmente** no repositório, nunca `--global`.

## Armadilhas

Cada uma destas já custou tempo. Não as reintroduza.

1. **`DEFAULT_FONT_SIZE` mora em `src/shell/env.ts`**, não em `terminal.ts`. É um
   módulo neutro de propósito: `storage.ts`, `terminal.ts` e `commands/font.ts`
   compartilham a constante sem que o bundle de teste headless puxe o xterm e o CSS
   junto.
2. **O emscripten precisa de `locateFile`** (`src/doom/runtime.ts`). Sem ele o
   `doom.data` é buscado relativo à página, não ao módulo, e o servidor devolve o
   `index.html` — que aparece como *"Wad file doesn't have IWAD or PWAD id"*.
3. **`_dg_tick()` só é chamado quando `_dg_clock()` vira.** O `TryRunTics` do
   doomgeneric faz busy-wait até a fronteira do tic; ticar a 60Hz queima 14ms por
   frame sem produzir nada.
4. **Um frame em voo por vez** (`writeBusy` + callback de `writeBytes`). Empurrar
   mais rápido do que o xterm.js consome não adianta o desenho: acumula latência e
   desafoga em rajada, que é o que se sente como engasgo.
5. **A proporção da célula é medida no DOM** (`cellAspect()`), nunca assumida. Ela
   muda com fonte e altura de linha, e errar nela achata a imagem do DOOM.
6. **`Invocation.piped`** existe porque comando com saída para pipe ou arquivo muda
   de formato. Sem respeitar isso, `ls | wc -l` conta linhas de coluna em vez de
   arquivos.
7. **`test/` está no `tsconfig.json` de propósito.** Sem isso o stub de terminal sai
   de sincronia com `TerminalControl` em silêncio.
8. **`src/generated/` é gerado e ignorado pelo git.** Nunca editar à mão.
9. **O line editor não confia na posição implícita do cursor.** Ele quebra a linha em
   pedaços da largura exata da tela e emite `\r\n` explícito. Mexer nisso sem testar
   linha embrulhada quebra a edição em toda linha longa.
10. **A API pode estar fora, e o site tem que continuar.** Todo comando de camada 3
    passa por `needsMachine`, que trata `SystemOffline`. Metade dos testes de camada 3
    roda justamente sem servidor — não os "conserte" subindo a API no teste.
11. **`needsMachine` valida as flags ANTES de ir à rede.** Um `free -z` está errado
    com ou sem Pi do outro lado, e responder "cannot reach the machine" a um erro de
    digitação manda procurar o problema no lugar errado.
12. **Fora do Linux não existe `/proc`.** A API cai em `api/fake.py` e marca
    `synthetic: true`, que o terminal exibe. Nunca remova esse aviso: ele é o que
    impede alguém de tomar número inventado por leitura de máquina.
13. **Aba automatizada estrangula timer e rAF.** Cronometrar boot ou repintura por
    screenshot dá número inflado — o `npm test` mede isso fora do navegador, e é
    nele que se deve confiar.

## Adicionar um comando

Escreva um `CommandSpec` (`src/commands/types.ts`) e registre em `registry.ts`. O
`help`, o `help --all`, o `man` e o `/usr/bin` do filesystem simulado se atualizam
sozinhos a partir do registro.

## Conteúdo

A arte ASCII do boot fica em `art/banner.txt`, crua — trocar é colar por cima do
arquivo, e o build gera o `src/generated/art.json` que o boot importa. Nunca mova
isso para dentro de um `.ts`: obrigaria a escapar barra invertida e crase a cada
troca, que é o atrito que a pasta existe para evitar (`art/README.md`).

Os `.txt` em `content/<lang>/` espelham a raiz do filesystem simulado. O mtime que o
`ls -l` mostra é a data do último commit git que tocou o arquivo — arquivo não
commitado cai no mtime do disco.

## Deploy

Raspberry Pi 8GB, nginx na porta 8080 servindo `dist/` e fazendo proxy de `/api`
para o uvicorn em 127.0.0.1:8000, tudo atrás de Cloudflare Tunnel. Os arquivos
prontos estão em `deploy/`. Deploy é manual e por decisão registrada não há CI
(`DESIGN.md` §4).
