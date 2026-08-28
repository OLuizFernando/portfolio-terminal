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
npm test          157 smoke tests headless (esbuild + node, sem navegador)
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

- Código, identificadores e mensagens de commit: **inglês**.
- Saída do terminal: escrita em **inglês**, no código, e traduzida por cima em
  `src/i18n/`. O inglês é a fonte; o português é catálogo.
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
13. **Chip da barra do mobile responde a `pointerdown`, não a `click`.** O clique só
    chega depois de o navegador já ter tirado o foco do terminal, e foco perdido no
    celular é o teclado do sistema fechando na cara de quem tocou. O `preventDefault`
    no `pointerdown` é o que impede a troca de foco. O dado entra pelo `term.input()`,
    não pelo `editor.handle()`: só assim o toque também pula o boot, que escuta os
    dados do terminal e não conhece o editor.
14. **O teclado do sistema cobre a tela, não empurra o layout.** O `innerHeight`
    continua relatando a tela inteira; quem sabe quanto sobrou é o `visualViewport`
    (`src/terminal/mobile.ts`). Posicionar a barra por `innerHeight` a esconde atrás
    do teclado exatamente quando ela serve para alguma coisa.
15. **Aba automatizada estrangula timer e rAF.** Cronometrar boot ou repintura por
    screenshot dá número inflado — o `npm test` mede isso fora do navegador, e é
    nele que se deve confiar.
16. **A JetBrains Mono do Google Fonts não tem bloco nem box-drawing.** Os subsets
    dele (latin, latin-ext, cyrillic) não cobrem `█ ╗ ═`, que são o banner inteiro.
    Os arquivos em `public/fonts/` vêm do release oficial por causa disso; ao
    trocar de versão, confira no DOM que `█` avança o mesmo que `M`.
17. **`limit_req_zone` não existe dentro de `server`.** Ela mora em
    `deploy/nginx-limits.conf`, que vai em `/etc/nginx/conf.d/`, e os dois arquivos
    do nginx se instalam juntos — meio caminho deixa uma configuração que o
    `nginx -t` recusa, com o nginx já recarregando.
18. **A chave do rate limit é o `CF-Connecting-IP`.** Atrás do túnel, o
    `remote_addr` é 127.0.0.1 para o mundo inteiro; limitar por ele limita todo
    mundo junto na primeira rajada de uma pessoa só.
19. **`vfs.remount()` descarta os pontos de montagem sintéticos.** `/usr/bin`,
    `/proc` e o `~/.bash_history` não vêm do manifesto — são escritos por cima
    depois. Trocar a árvore pelo `lang` sem refazer os três deixa `ls /usr/bin`
    vazio e o histórico do visitante inacessível. Quem centraliza isso é o
    `remount` do `main.ts` — e ele serve tanto o `lang` quanto o `reboot`,
    que remonta pelo mesmo caminho. Pelo mesmo motivo, o `syncBashHistory`
    desiste quando o home não existe: um `writeFile` ali recriaria o diretório
    inteiro no comando seguinte a um `rm -rf /`, ressuscitando o que o visitante
    acabou de apagar. Isso não aparece no `npm test`, que não tem histórico.
20. **Os nomes de arquivo são iguais em `content/en/` e `content/pt/`.** É o que
    permite o `lang` preservar o diretório atual. Traduzir um nome de caminho
    manda o visitante de volta para o home toda vez que ele troca de idioma.
21. **A telemetria guarda a primeira palavra e nada mais**, e o `/etc/privacy`
    promete isso por escrito. Mudar o que `src/system/telemetry.ts` manda sem
    mudar o arquivo transforma o texto numa mentira publicada.
22. **O `/RECOVERY.txt` é a única saída do `rm -rf /`** que não passa por
    recarregar a página, e a única pista dele é a última linha que o `rm`
    imprime: a reclamação de não ter conseguido removê-lo. Ela é a última porque
    o arquivo é escrito **depois** da varredura — escrevê-lo antes o joga para o
    meio de oitenta linhas de `removed '<path>'`, onde ninguém o lê, e deixa o
    visitante sem caminho de volta. Pelo `rm -rf /*` essa linha não sai, e é de
    propósito: o glob fechou a lista antes de o arquivo existir, e o `rm` varre
    só os caminhos que recebeu.
23. **O bloco de apagamento é o último do `test/shell.test.ts`.** Ele derruba a
    árvore de verdade; teste escrito depois dele roda num sistema vazio.
24. **O locale é global ao módulo, e o `npm test` roda numa sessão só.** Quem
    chama `setLocale` é o `main.ts` (na restauração das preferências, antes do
    boot) e o `lang`. No teste isso significa que todo bloco escrito depois do
    `lang pt` roda em português até alguém voltar para o inglês — o bloco de
    idioma termina com um `lang en` justamente por isso, e o de apagamento, que
    vem depois, afere string em inglês.
25. **Mensagem nova precisa de chave, não de literal.** Uma string escrita
    direto no `fail()` funciona, passa no build e some do português sem avisar
    ninguém. O TypeScript só cobra o que está na interface `Messages`, então o
    que não passa por ela não existe para a tradução.
26. **Número que aparece na tela passa pelo `fixed()`, não pelo `toFixed()`.**
    O separador decimal é do idioma: `7.9Gi` em inglês, `7,9Gi` em português. As
    duas exceções são de propósito — os carimbos do POST do boot, que são do
    kernel, e nada em `src/doom/` fora do HUD do `--fps`.
27. **No `dg_render`, a cor tem que ser reafirmada depois de cada salto de
    cursor.** O emissor pula os trechos que não mudaram e salta o cursor para o
    próximo; o SGR que vale no destino do salto é o que o trecho anterior
    deixou, não o que este espera. Sem zerar o `emitted` no salto, o primeiro
    trecho de cada linha sai pintado com a cor da última célula da linha
    anterior — e isso só aparece como cor borrada durante a partida, nunca no
    build. Pelo mesmo motivo o frame termina em `\x1b[0m`: o HUD do `--fps`
    escreve por cima da imagem, e o shell reaparece na saída. A cor também tem
    zona morta própria (`g_color_deadband`), pela mesma razão que a luminância
    tem — zerá-la custa 10KB por quadro numa cena parada, redesenhando o que
    não mudou.

## Adicionar um comando

Escreva um `CommandSpec` (`src/commands/types.ts`) e registre em `registry.ts`. O
`help`, o `help --all`, o `man` e o `/usr/bin` do filesystem simulado se atualizam
sozinhos a partir do registro.

Depois traduza: uma entrada em `ptDocs` (`src/i18n/docs.ts`) com `summary`,
`usage` e `man`, e toda mensagem nova que o comando imprima em
`src/i18n/messages.ts` (inglês) e `src/i18n/pt.ts` (português). O `npm test`
cobra a entrada de `ptDocs`; o TypeScript cobra o catálogo de mensagens.

## Conteúdo

A arte ASCII do boot fica em `art/banner.txt`, crua — trocar é colar por cima do
arquivo, e o build gera o `src/generated/art.json` que o boot importa. Nunca mova
isso para dentro de um `.ts`: obrigaria a escapar barra invertida e crase a cada
troca, que é o atrito que a pasta existe para evitar (`art/README.md`).

Os `.txt` em `content/<lang>/` espelham a raiz do filesystem simulado. O mtime que o
`ls -l` mostra é a data do último commit git que tocou o arquivo — arquivo não
commitado cai no mtime do disco.

O `/etc/privacy` é conteúdo com contrato: ele declara por escrito o que a
telemetria guarda, e mudar `src/system/telemetry.ts` sem mudar o arquivo publica
uma mentira (armadilha 21).

Dois arquivos da árvore não vêm de `content/`: o `/etc/os-release` e o
`/usr/share/doc/portfolio/CHANGELOG` são gerados pelo `build-fs.mjs` a partir do
`git log`, iguais nos dois idiomas, e ficam de fora quando não há checkout do git.

A JetBrains Mono em `public/fonts/` também é colada, não gerada — o `README.md` de
lá diz de onde ela vem e por que não é a do Google Fonts.

## Deploy

Raspberry Pi 5 (8GB), nginx na porta 8080 servindo `dist/` e fazendo proxy de `/api`
para o uvicorn em 127.0.0.1:8000, tudo atrás de Cloudflare Tunnel. Os arquivos
prontos estão em `deploy/`. Deploy é manual e por decisão registrada não há CI
(`DESIGN.md` §4).
