# Portfólio Terminal — Documento de Design

> Portfólio pessoal do Luiz Fernando, hospedado em Raspberry Pi 5 (8GB), no formato de um
> terminal Unix simulado e navegável.
>
> Última atualização: 2026-08-27

---

## 1. Conceito

Ao entrar em `oluizfernando.com.br`, o visitante não vê um site — vê um terminal.
Fundo preto, boot de sistema acontecendo linha a linha, informações de máquina sendo
impressas e, no fim, um prompt piscando esperando comandos.

Não há UI. Não há botões, menus ou seções clicáveis. O portfólio inteiro é um
**filesystem simulado** que a pessoa explora com `ls`, `cd`, `cat`, `grep` — e um
punhado de comandos especiais, incluindo `doom`.

**Natureza do projeto:** hobby. O objetivo é artesanato e diversão, não conversão de
recrutador. Decisões de design foram tomadas priorizando prazer de construir e
memorabilidade, não performance de funil.

### O que amarra o conceito

A máquina existe de verdade. Comandos como `neofetch`, `uptime`, `free`, `top` e
`cat /proc/cpuinfo` retornam **dados reais do Raspberry Pi** que está servindo a
página naquele momento. O visitante não está lendo texto pré-escrito sobre uma
máquina — está olhando pra dentro dela.

---

## 2. Decisões fechadas

### 2.1 Shell

| Decisão                   | Escolha                                                                |
| ------------------------- | ---------------------------------------------------------------------- |
| Profundidade da simulação | Filesystem simulado real (não é menu disfarçado)                       |
| Pipes e redirecionamentos | **Sim** — `\|`, `>`, `>>`                                              |
| Encadeamento              | `&&`, `\|\|`, `;`                                                      |
| Shell real em container   | **Não** — risco de segurança não justificado                           |
| Tab-completion            | Comandos **e** caminhos; Tab duplo lista ambiguidades                  |
| Atalhos                   | `Ctrl+C` cancela a linha, `Ctrl+L` limpa a tela, ↑/↓ navegam histórico |

O parser precisa dar conta de: tokenização, aspas simples e duplas, globs (`*`),
pipes e redirecionamentos.

**Decisão tomada na implementação:** `&&`, `||` e `;` entraram junto. Sem eles,
`cd projects && ls` era aceito silenciosamente com `&&` virando argumento do `cd`
— falha muda, o pior tipo. São ~20 linhas no parser e estão no espírito de
"filesystem simulado real, não menu disfarçado".

**Também decidido na implementação:** comandos sabem quando a saída vai para um
pipe ou arquivo em vez da tela. É o que faz `ls | wc -l` contar arquivos em vez
de contar colunas, como no `ls` de verdade.

### 2.2 Estética

| Decisão                        | Escolha                                         |
| ------------------------------ | ----------------------------------------------- |
| Paleta                         | **Branco puro sobre preto.** Sem cores.         |
| Destaques                      | **Negrito**, e só                               |
| Fonte                          | JetBrains Mono                                  |
| Efeitos (CRT, scanlines, glow) | **Desligados por padrão**, ligáveis por comando |
| Boot                           | Streaming linha a linha                         |

**Nota sobre a fonte:** a JetBrains Mono é aberta (OFL) e está no Google Fonts, mas
deve ser **auto-hospedada** — o Pi já serve os estáticos e o Cloudflare cacheia na
borda, então não há motivo pra depender de terceiro. Só o peso Regular em `.woff2`
resolve (paleta é branco puro e o único destaque é negrito, então bastam **Regular e
Bold**). Sem variante Nerd Font: o `neofetch` e o `tree` usam apenas ASCII e caracteres
de box-drawing, e o banner do boot acrescenta blocos (`█`, U+2588) — a JetBrains
Mono cobre os três nativamente.

**E é por isso que os arquivos vêm do release oficial, não do Google Fonts**
(feito em 2026-08-27). O que o Google serve é subsetado por faixa Unicode — latin,
latin-ext, cyrillic — e **nenhuma dessas faixas tem bloco nem box-drawing**. Com
o subset, o navegador cai numa fonte de fallback no meio do banner, com outra
largura de avanço, e a arte desmorona. Conferido medindo no DOM: `█`, `╗` e `═`
avançam os mesmos 8,4px que o `M` a 14px. `public/fonts/README.md` explica como
trocar de versão sem perder isso.

### 2.3 Estrutura do filesystem

O conteúdo do portfólio mora todo em `~`, raso (máximo 2 níveis). O restante do
sistema de arquivos existe como camada de easter egg para quem explora.

O visitante entra como **`guest@oluizfernando`**, com home em `/home/guest`. A
ficção fecha: você deu SSH na máquina do Luiz como convidado, e o portfólio são os
arquivos que ele deixou lá.

```
~/
├── README.txt          ponto de entrada: quem é + o que explorar
├── about.txt           versão longa, voz própria
├── contact.txt         email, GitHub, LinkedIn
├── skills.txt
├── education/
│   ├── degree.txt      formação formal, com a instituição explicada em inglês
│   ├── courses.txt     cursos e certificações, bloco por curso
│   └── books.txt       livros lidos, título e autor em duas colunas
├── experience/
│   ├── veeva.txt
│   └── ...
└── projects/
    ├── estudafatec/
    ├── fintrack/
    ├── pagefinder/
    └── portfolio-terminal/
        ├── README.txt
        ├── stack.txt
        └── links.txt
```

Fora da home (easter eggs):

- `/etc/motd`
- `/var/log/career.log` — trajetória em formato de log com timestamps
- `/proc/cpuinfo`, `/proc/meminfo` — **dados reais do Pi**
- `/usr/bin/` — lista todos os comandos existentes
- `~/.secret` — só aparece com `ls -a`

**Decisões:**

- Arquivos são `.txt` crus. Sem Markdown renderizado.
- A estrutura de pastas em `projects/` existe desde a v1, independente da quantidade
  de projetos — é ela que dá sentido ao `cd` e ao Tab-completion.
- **Sem blog / sem `posts/`.**
- Formato de pasta por projeto permite coisas como
  `cat projects/*/stack.txt | grep -i react`.
- **São quatro projetos, e quatro é o teto**: `estudafatec`, `fintrack`,
  `pagefinder` e o `portfolio-terminal`. Cada um mostra uma coisa diferente
  (produto em produção, CRUD com gráficos, projeto final do CS50x, e a máquina
  em que você está). Um quinto que repetisse qualquer um deles só faria o
  visitante ler mais para saber o mesmo.
- O `estudafatec` é repositório privado: o `links.txt` dele publica a URL de
  produção e diz que a fonte é fechada, em vez de apontar para um 404.
- **Nome de arquivo diz a categoria, nunca a instituição.** `education/degree.txt`,
  não `education/fatec.txt`: o site é em inglês, e quem lê o `ls` de fora do
  Brasil não faz ideia do que é uma Fatec. O nome da instituição, por extenso e
  com uma linha explicando o que ela é, mora na primeira linha de *dentro* do
  arquivo, onde cabe. O `experience/veeva.txt` é a exceção que se justifica
  sozinha: Veeva é global e o nome já diz do que se trata.
- Em `courses.txt`, a URL é rotulada `Certificate:` ou `Course:` conforme o que
  ela de fato abre. Vários cursos da Udemy não têm certificado público, e um
  link de página de venda debaixo de um rótulo de certificado é uma promessa que
  a URL não cumpre.

### 2.4 Comandos

**Camada 1 — navegação e utilidades:**
`ls` (`-a`, `-l`), `cd`, `pwd`, `cat`, `tree`, `clear`, `help`, `man <cmd>`,
`history`, `font`, `exit`

O `font` muda o tamanho do texto (8 a 32px, `font reset` volta ao padrão) e
persiste. Não é easter egg: num site que é só texto, poder aumentar a fonte é
acessibilidade básica.

**Camada 2 — texto (justifica os pipes):**
`grep`, `echo`, `head`, `tail`, `wc`, `sort`, `uniq`, `find`

**Camada 3 — sistema (dados reais do Pi):**
`whoami`, `uname -a`, `uptime`, `date`, `neofetch`, `free`, `df`, `ps`, `top`

**Camada 4 — personalidade (escolhida em 2026-08-27):**
`doom`, `sudo`, `rm -rf /`, `cowsay`, `fortune`, `matrix`, `crt`, `stats` — e
`lang`, que ainda depende do conteúdo em português.

Ficaram de fora, e por quê:

- `sl` — a locomotiva é boa, mas custa animação e não guarda nada. O `matrix` já
  ocupa a vaga de "olha o que o terminal faz" sem ser um segundo desenho animado.
- `vim` (não deixar sair sem `:q`) — a piada é prender o visitante. Num celular,
  onde não existe `:` fácil, prender é só prender.
- `curl <url>` — buscar URL arbitrária do lado do servidor é um proxy aberto com
  outro nome. A única piada que custava superfície de ataque.

**Regras de comportamento:**

- Comando desconhecido → mensagem fiel ao bash (`bash: xyz: command not found`),
  sugerindo `help`.
- `help` mostra 6-8 comandos principais + aponta para `help --all`.
- `help --all` lista **todos os comandos funcionais**, incluindo `doom` e `neofetch`.
- Ficam fora de qualquer listagem apenas: conteúdo escondido no filesystem
  (`~/.secret`) e reações a comandos destrutivos (`rm -rf /`). Regra prática: _se é
  um comando, está no `help --all`; se é conteúdo escondido ou reação, não está em
  lugar nenhum._

### 2.5 Boot

Sequência, do primeiro ao último frame:

1. Linhas de POST/kernel **genéricas**, com cara de `dmesg` (~8-12 linhas)
2. Banner ASCII — **ANSI Shadow**, vindo de `art/banner.txt`
3. Bloco de sistema com **dados reais** (modelo do Pi, kernel, uptime, temperatura)
4. Linha de boas-vindas curta
5. Dica de idioma — **só** se o navegador for pt-BR:
   `dica: execute 'lang pt' para português`
6. `--help` curto
7. Prompt

**Duração:** medida em **2,1s** até o prompt (`npm test` trava a faixa em 1,5-4,5s).
Ficou abaixo dos 3-4s previstos de propósito: com a sequência montada, quatro
segundos antes de poder digitar são longos demais, e quem já viu tem a tecla de
pular. Qualquer tecla salta para o fim — e o teste confere que o texto pulado é
idêntico ao texto completo.

**Sem tela de login.** Sem BIOS elaborado. O boot termina em `~`.

> **A dica de idioma (item 5) ficou para a fase 4**, junto do comando `lang`.
> Anunciar `lang pt` antes de ele existir seria pior do que não anunciar.

**O banner mora fora do código**, em `art/banner*.txt`, e vira JSON no build. Num
`.ts` seria preciso escapar barra invertida e crase a cada troca — e a maioria
das fontes figlet é feita de barra invertida. Trocar a arte é colar por cima do
arquivo.

**Há um banner por faixa de largura**, e o boot usa o maior que couber inteiro:
`banner.txt` em ANSI Shadow com 106 colunas para janela de notebook, e
`banner-small.txt` em Digital com 27 para celular. Todo arquivo cujo nome comece
com `banner` entra na disputa, ordenado por largura — acrescentar um tamanho
intermediário é colar mais um arquivo, sem tocar em código.

Arte nunca é embrulhada: embrulhada ela não fica menor, fica quebrada. Se nem a
menor couber, sobra `OLuizFernando` por extenso, que diz a mesma coisa sem
parecer defeito.

### 2.6 Idiomas

- Conteúdo duplicado em `content/en/` e `content/pt/`
- **Inglês é o padrão para todos**
- Comando `lang` alterna em runtime
- **Nunca troca sozinho** por detecção de navegador — só imprime a dica no boot.
  Trocar automaticamente tira a agência do visitante, que é a alma do projeto.

### 2.7 Mobile

Suporte real, não recusa nem modo degradado:

- Tocar na tela sobe o teclado do sistema
- Barra de **chips** acima do teclado, para evitar digitação
- Fonte menor por padrão em tela de toque
- **DOOM é desktop-only** (mensagem explicativa no mobile)

**Os chips são sete:** `ls`, `cd ..`, `cat`, `Tab`, `↑`, `help`, `^C`. Os quatro
comandos cobrem navegar e ler, que é o site inteiro. `Tab` e `↑` entraram porque
economizam mais digitação do que qualquer comando — `cat` sozinho existe para ser
completado com `Tab`, e `↑` repete o que já foi digitado. `^C` é a saída de uma
linha começada por engano, que no vidro é fácil demais de acontecer.

Sete é o limite: eles cabem exatos numa tela de 390px, e chip que só aparece
rolando não economiza o toque que ele existe para economizar.

O toque entra pelo `input()` do xterm, não direto no editor de linha: assim o
chip percorre o mesmo caminho de uma tecla de verdade, inclusive o de pular o
boot, que escuta os dados do terminal e não conhece o editor.

**Tamanho da fonte:** 12px na tela de toque, 14px no resto. A 14px um celular de
390px cabe 43 colunas; `df`, `free` e o cabeçalho do `top` são escritos para 50 e
poucas. O `font reset` volta para o padrão do aparelho, não para o do projeto.

**Layout compacto:** medido, não presumido. O `tree` do conteúdo real não passa
de 30 colunas, então não ganhou modo compacto nenhum — seria código morto. O
`neofetch` precisa de 55 (arte + texto) e por isso larga a framboesa quando não
cabe: embrulhada ela não encolhe, só quebra no meio das palavras.

**O teclado do sistema não empurra layout, ele cobre.** Quem sabe quanto sobrou é
o `visualViewport`; o `innerHeight` segue relatando a tela inteira. A barra e o
terminal se posicionam por essa diferença.

### 2.8 DOOM

**`doom-ascii` compilado para WebAssembly, renderizando dentro do próprio terminal.**
Não é canvas sobreposto — os frames são desenhados na grade de texto do xterm.js. A
metáfora permanece intacta.

Duas consequências aceitas:

1. **Decide a arquitetura de renderização.** 30+ fps numa grade de texto não funciona
   com DOM. Por isso xterm.js com WebGL.
2. **Peso:** runtime WASM + WAD ≈ 3-5MB. Carregamento **sob demanda** (só quando
   alguém digita `doom`) + cache agressivo. O cache de borda do Cloudflare absorve
   isso, protegendo o upload da conexão residencial.

Plano de contingência, se a performance não fechar: canvas sobreposto com js-dos.

**Resultado do spike (fase 2, 2026-08-27): funcionou. O plano de contingência
foi descartado.**

Medido em jogo (não na tela de título), grade 160x60, Chrome no Mac:

|                                     | ms por frame                                      |
| ----------------------------------- | ------------------------------------------------- |
| tick do DOOM + conversão para ASCII | **1,4** (p50) · 1,6 (p95) · 2,0 (p99) · 3,0 (máx) |
| montagem da string do frame         | 0,03                                              |
| **orçamento a 35 fps**              | **28,57**                                         |

Sobra folga de mais de 20x. O gargalo que eu esperava — converter 64.000 pixels
por frame — não existe: é ruído dentro do custo do próprio renderizador do DOOM.

**A armadilha que quase matou o spike.** O `TryRunTics` do DOOM faz _busy-wait_
até a virada do tic. Chamar o tick a 60Hz (o ritmo do `requestAnimationFrame`)
enquanto o jogo roda a 35Hz fazia metade das chamadas girar em falso, queimando
até 28ms da thread principal sem produzir nada — p95 de 27,5ms, ou seja, o
orçamento inteiro gasto em espera. A correção não é dormir menos: é **expor o
relógio do próprio DOOM (`I_GetTime`) para o JS e só chamar o tick quando o tic
virar**. Mesma fórmula, mesmo relógio, sem defasagem de fase. p95 caiu de 27,5ms
para 0,2ms.

**Custo que sobra:** carregar um mapa trava a aba por ~1,1s. É o `P_SetupLevel`
lendo e montando a geometria, não tem a ver com o terminal. Aceito: acontece uma
vez por nível.

**Ainda não medido:** o custo de _parse_ e desenho do xterm.js para os ~10KB de
frame a 35Hz (~350KB/s). Não deu para medir em aba automatizada, porque o
navegador estrangula o `requestAnimationFrame` de aba oculta. O HUD do
`doom --fps` mostra o número real numa janela de verdade.

### Como está montado

- **`doomgeneric`** (não o `doom-ascii`) com um backend ASCII escrito para este
  projeto, em `wasm/doomgeneric_wasm.c`. Sem SDL, sem canvas, sem som.
- Compilado a **320x200** — o doomgeneric faria um upscale para 640x400 que a
  reamostragem jogaria fora em seguida.
- O backend reamostra em caixa para a grade do terminal e mapeia luminância
  (Rec.601) numa rampa de densidade de 23 caracteres. Como a paleta é branco
  puro, luminância é a única informação que sobreviveria de qualquer forma.
- **O laço mora no JS**, não no C: sem `emscripten_set_main_loop`, sem asyncify.
  O navegador nunca perde o controle do frame.
- **Buffer alternativo de tela** (`\x1b[?1049h`), como qualquer programa de
  terminal de verdade: o shell fica intacto embaixo e reaparece exatamente como
  estava quando o visitante sai com **Ctrl+C**.
- Teclado capturado em `window` na fase de captura, com keydown **e keyup** —
  o `onData` do xterm.js não reporta soltura de tecla, e sem isso o personagem
  nunca para de andar.
- Aba em segundo plano: o relógio do DOOM é ressincronizado no `visibilitychange`,
  senão o jogo tentaria recuperar centenas de tics de uma vez ao voltar.

### WAD

**`doom1.wad`, o episódio shareware** (4,2MB, sha256 `1d7d43be…`), distribuído
livremente pela id desde 1993. A alternativa aberta seria o Freedoom, mas o
`freedoom1.wad` passa de 20MB — quatro vezes o orçamento — e não é o DOOM.

O WAD **não entra no bundle**: vira um `doom.data` que o emscripten busca sob
demanda. `public/doom/` soma **4,5MB** (wasm 389KB + data 4,0MB + loader 62KB),
dentro dos 3-5MB previstos.

**Detalhe de deploy:** os artefatos compilados são **versionados**. O Pi não tem
nem precisa ter emscripten — `git pull` já traz o DOOM pronto. Recompilar exige
`./wasm/fetch-sources.sh` (baixa doomgeneric + WAD, confere o sha256) e depois
`./wasm/build.sh`.

**Em aberto:** o build é **sem som**. DOOM mudo tem o seu charme, mas é uma
decisão que ainda não foi tomada de propósito.

### Resolução e fluidez (ajustes de 2026-08-27, depois de jogar de verdade)

Duas coisas incomodaram no primeiro teste real: pouca resolução e engasgos.

**A fonte padrão do terminal é 14px**, definida em um único lugar
(`DEFAULT_FONT_SIZE` em `src/shell/env.ts`) e compartilhada pelo terminal, pelas
preferências e pelo comando `font`.

**Resolução ajustável, com o padrão sendo a fonte do terminal.** `doom` sem
argumento joga na grade que a janela já tem; `doom --font=<px>` (4 a 24) encolhe
o caractere só durante a partida e devolve ao sair. O shell nunca vê a troca,
porque tudo acontece no buffer alternativo.

> Chegou a existir a ideia de tirar esse knob, por medo de alguém derrubar o Pi
> com `--font=1`. **O medo era infundado: o DOOM roda no navegador do visitante.**
> O Pi só serve arquivos estáticos — quem paga a conta de uma fonte minúscula é a
> máquina de quem está jogando. Com isso o knob voltou, e o teto real é a própria
> grade: o backend em C limita em 400x200 células, e o JS espelha esse limite —
> conferido com `--font=6`, que pediria 557 colunas e recebeu 384.

O `doom --font` é **temporário e independente do `font`**: sai da partida e o
shell volta ao tamanho que o visitante tinha escolhido, não ao padrão.

Números na tela do Luiz (viewport ~1530px):

|                 | grade do DOOM | células          |
| --------------- | ------------- | ---------------- |
| `doom` (14px)   | 142x45        | 6.390            |
| `doom --font=8` | 286x86        | 24.596           |
| `doom --font=6` | 384x108       | 41.472 (no teto) |

**A proporção da célula agora é medida, não constante.** O valor fixo de 8:3 vinha
de supor célula 1:2, e a imagem saía achatada: a medição real dá **0,421** a 14px
e **0,400** a 8px. `cellAspect()` divide as dimensões de `.xterm-screen` por
cols/rows, então acerta em qualquer fonte.

**Os engasgos tinham duas causas, ambas do lado do JS:**

1. **Lixo por frame.** Cada frame decodificava uma string de ~6KB e montava outra
   por concatenação — ~1,5MB/s de garbage, e coletas periódicas que aparecem como
   travadinhas regulares. Agora **o frame ANSI é montado dentro do wasm** e o JS
   só passa um `Uint8Array` apontando para a heap. Zero alocação por frame.
2. **Sem controle de vazão.** Um frame era empurrado a cada 28ms sem checar se o
   anterior tinha sido processado. A fila do xterm.js acumulava e desafogava em
   rajada. Agora é **um frame por vez**, liberado pelo callback do `write`.

Como o buffer ANSI vive na heap do wasm e a escrita no xterm.js é assíncrona, são
**dois buffers alternados** — o wasm nunca escreve no que o terminal está lendo.

**Duas otimizações a mais:**

- **Redesenho parcial:** cada linha manda só o trecho entre a primeira e a última
  célula que mudaram. Economia medida de 14% a 36%, conforme o movimento.
- **Zona morta de luminância:** um pouco menos que um degrau da rampa (256/23 ≈ 11,
  zona morta 8). Mata a oscilação em cima da fronteira entre dois caracteres sem
  nunca segurar a célula a mais de um degrau da verdade. Melhora o visual e torna
  o redesenho parcial muito mais eficaz.

**O gargalo é o desenho do xterm.js, não o DOOM.** Ficou provado por teste em
máquina real: numa grade de 288x96 o jogo engasgava, e em 192x64 rodava liso — com
o tick do DOOM custando o mesmo nos dois casos. É por isso que o `--font` é o
botão certo para quem sentir engasgo: ele mexe justamente no número de células,
que é o que o terminal precisa desenhar. Na grade padrão o tick custa **~0,8ms**
contra 28,57ms de orçamento.

### 2.9 Persistência

| Item                                          | Comportamento                                                     |
| --------------------------------------------- | ----------------------------------------------------------------- |
| Histórico de comandos                         | **Persiste** em `localStorage`, legível via `cat ~/.bash_history` |
| Preferências (`lang`, `font`, `crt`, efeitos) | **Persistem**                                                     |
| Diretório atual                               | **Reseta** para `~` a cada visita — o boot termina em casa        |

### 2.10 Telemetria

Os comandos digitados pelos visitantes **são registrados**. Construído em
2026-08-27.

- Cliente acumula em memória e **envia em lote** (a cada 10 comandos, ao trocar de
  aba e ao fechar — as duas últimas por `sendBeacon`)
- Payload: **a primeira palavra** da linha, e se ela é um comando que existe
- **Sem IP, sem cookie, sem identificador de sessão**
- Gravação em JSONL simples. Sem banco.
- Rate limit no nginx + limite de tamanho por requisição
- Declarado abertamente em `cat /etc/privacy`

**Três decisões que apertaram o que estava escrito aqui antes:**

1. **A primeira palavra, não a linha.** `cd projects` vira `cd`. Os dois rankings
   do `stats` só precisam disso, e o resto da linha é justamente onde alguém
   poderia ter escrito algo sobre si mesmo num `echo`. O que não é gravado não
   vaza.
2. **O relógio é o do servidor, na chegada.** O relógio de uma máquina tem desvio
   próprio e resolução de milissegundo, o que faz dele um identificador bom
   demais para quem promete não identificar.
3. **Nem identificador aleatório.** Duas linhas do mesmo visitante são
   indistinguíveis de duas linhas de dois visitantes. É o que impede reconstruir
   uma sessão a partir do arquivo — inclusive por quem tem o arquivo.

**Onde mora:** `/var/lib/portfolio/commands.jsonl`, criado pelo `StateDirectory=`
da unit. É o único lugar do disco onde a API pode escrever: o `ProtectSystem=strict`
fecha o resto, e o `ReadOnlyPaths=/srv/portfolio` fecha até o próprio clone.

**O agregado vive em memória.** O arquivo é lido uma vez na subida para
reconstruí-lo; depois disso responder ao `stats` não custa I/O. Uma linha tem ~60
bytes, então o arquivo é irrelevante em disco por anos — e se um dia não for, quem
rotaciona é o logrotate, sem mudar código.

**A chave do rate limit é o `CF-Connecting-IP`,** não o `remote_addr`: atrás do
túnel toda requisição chega de 127.0.0.1 e o endereço real do socket não distingue
ninguém. O contador vive na memória do nginx, não vai para disco, e o
`/etc/privacy` diz isso.

**Retorno:** alimenta o comando `stats` público — comandos mais digitados e quais
comandos inexistentes as pessoas mais tentaram. Conteúdo que se escreve sozinho e
serve de rota indireta de descoberta dos easter eggs.

---

## 3. Arquitetura

```
Visitante
   │
   ▼
Cloudflare (túnel já configurado, cache de borda)
   │
   ▼
Raspberry Pi 5 (8GB)
   ├── nginx  :8080   → serve /dist (estático) e faz proxy de /api
   └── FastAPI/uvicorn (systemd) → /api/stats, /api/log
```

### 3.1 Frontend

- **xterm.js + addon WebGL** como fundação
- Vite + TypeScript, **sem framework**. Não há estado de UI para um React gerenciar.
- Sai de graça do xterm.js: parser ANSI, seleção e cópia, wrapping, cursor,
  resize, e o hack de input invisível que faz o teclado do mobile subir
- `screenReaderMode: true` (booleano, custo zero)

### 3.2 Backend

Python — **FastAPI + uvicorn**. Verificado: para endpoints que só leem `/proc` e
devolvem JSON, o custo é I/O e não CPU; a diferença para Node é invisível debaixo da
latência de rede.

**`GET /api/stats`** — cacheado por 2s (evita que um `top` ao vivo leia `/proc`
30x/s por visitante). Devolve: modelo do Pi, kernel, uptime, load average, uso e
temperatura da CPU, RAM usada/livre, uso de disco, lista de processos.

Alimenta de uma vez: `neofetch`, `uptime`, `free`, `df`, `ps`, `top`,
`/proc/cpuinfo`, `/proc/meminfo`.

**`GET /api/proc/{name}`** — o conteúdo **cru** de um arquivo de /proc, em texto.
Lista fechada: `cpuinfo`, `meminfo`, `uptime`, `loadavg`, `version`. É o que faz
`cat /proc/meminfo` mostrar o arquivo de verdade em vez de uma imitação. Por isso
esses arquivos existem na árvore com **tamanho zero** — que é, por acaso,
exatamente o que `ls -l` mostra num /proc de verdade.

**`POST /api/log`** — recebe lotes de comandos. **Único endpoint de escrita do
projeto**, e por isso o único com `limit_req` e limite de corpo (4k) no nginx. O
corpo é validado por modelo estrito: campo a mais rejeita o lote inteiro, e nome
que não é nome de comando é descartado em silêncio.

**`GET /api/usage`** — o agregado que o comando `stats` mostra. Sai da memória,
não do disco (ver 2.10).

**Degradação:** o site é estático e não depende da API para existir. Quando ela
não responde, cada comando de camada 3 responde `cannot reach the machine` e o
resto da sessão segue intacta — inclusive o boot, que troca o bloco de sistema
por duas linhas e continua. Isso é testado: metade dos testes de camada 3 roda
justamente sem servidor.

**Fora do Linux não há /proc.** Num Mac a API entra em modo sintético e marca
`synthetic: true` no JSON; o terminal exibe o aviso em toda tela que mostra esses
números. Sem isso, o frontend só poderia ser desenvolvido no Pi.

**Decisões de privacidade:**

- `ps`/`top` mostram **processos reais**
- Mitigação: manter um array de nomes a filtrar no endpoint, para o caso de subir
  algo no Pi cujo nome não se queira anunciar
- `top` é **ao vivo** — repinta a cada 2s até `q`. É o momento em que o visitante
  entende que está olhando uma máquina de verdade.

### 3.3 Contato

O comando `contact` **apenas imprime** email, GitHub e LinkedIn. Sem compositor de
email, sem formulário, sem captcha.

### 3.4 Conteúdo e deploy

**Conteúdo:** arquivos `.txt` reais em `content/`, espelhando a árvore do filesystem
simulado. Um script no build varre a pasta e gera o manifesto que o terminal carrega.
Escrever conteúdo novo = criar um `.txt` e commitar.

> **Detalhe que faz a ilusão parar de pé:** usar a **data do último commit git de cada
> arquivo** como timestamp do filesystem simulado. Assim `ls -l` mostra datas
> verdadeiras.

**Deploy:** manual, e o build roda no Pi: `ssh raspberrypi deploy-portfolio`.

A lógica mora em **`deploy/deploy.sh`, versionada**, e o `/usr/local/bin/deploy-portfolio`
é um wrapper fino (fonte em `deploy/deploy-portfolio`) que sincroniza com o remoto
e então dá `exec` no script do repositório. A divisão existe porque o bash lê
script em pedaços, e um sync que trocasse o arquivo no meio da própria execução
daria comportamento esquisito — como o sync termina antes do `exec`, o bash só
começa a ler o `deploy.sh` quando ele já está na versão final.

O wrapper é o único arquivo que vive fora do repositório, e o `deploy.sh`
**reinstala a cópia sozinho** quando o fonte muda. É seguro porque, àquela altura,
o `exec` já trocou a imagem do processo: ninguém mais está lendo aquele arquivo.

> **O sync é `fetch` + `reset --hard origin/main`, não `pull --ff-only`.** O Pi é
> alvo de deploy, não lugar de trabalho: o certo é espelhar o remoto, não conciliar
> histórias. O `--ff-only` recusava depois de um push forçado e obrigava a entrar
> no Pi para desatolar na mão. O commit descartado continua no reflog do Pi, e o
> script avisa quando descarta algo — inclusive alteração não commitada.

> Ele já morou inteiro fora do repositório. Passou a valer versionar quando o
> deploy deixou de ser "pull e build": com venv, dependências em duas linguagens e
> serviço para reiniciar, um script solto no `/usr/local/bin` divergiria do que o
> repositório precisa, sem ninguém perceber.

Comparando o commit de antes com o de depois, ele decide o que fazer: recria o venv
se o `api/requirements.txt` mudou (o pip instala o que falta mas nunca remove o que
saiu da lista, e um venv que só cresce acaba cheio de coisa que ninguém importa),
roda `npm ci` só se o `package-lock.json` mudou (num Pi isso é minuto, não segundo),
builda sempre, reinicia a API se `api/` mudou, e reinstala a unit ou o nginx se os
arquivos de `deploy/` mudaram. No fim confere o `/api/health` e **falha com código 1**
se a resposta não for `{"ok":true,"linux":true}`: "o deploy passou" não é a mesma
coisa que "o site funciona".

O clone no Pi é **completo, sem `--depth 1`**: num clone raso todo arquivo teria a
mesma data de commit e o `ls -l` perderia a graça.

**nginx:** um `server` na 8080, `root` no `dist/`, `try_files $uri $uri/
/index.html`, cache imutável em `/assets/` e `/fonts/`, 30 dias em `/doom/` e
`no-cache` no `index.html`. O `application/wasm` precisa estar no
`/etc/nginx/mime.types` — sem ele o `instantiateStreaming` falha e o emscripten cai
no caminho lento. O deploy não recarrega o nginx nem limpa cache de borda: o
diretório é servido direto, e os nomes com hash do Vite dão URL nova a cada versão.

> **Webhook do GitHub está fora**, e não por preguiça: ele precisaria alcançar o Pi
> de fora, e a razão de existir do Cloudflare Tunnel é justamente não haver porta
> aberta no roteador. Se o comando manual incomodar, o caminho é o Pi **perguntar** —
> um systemd timer chamando o mesmo script — em vez de ser avisado. Sem CI.

### 3.5 Infraestrutura (já existente)

- Raspberry Pi 5 (8GB)
- Exposto via **Cloudflare Tunnel** — sem portas abertas no roteador, IP residencial
  escondido, HTTPS de graça, imune a CGNAT
- Domínio: **oluizfernando.com.br**
- Porta 8080 livre, reservada para este projeto

---

## 3.6 Mapa do repositório

```
scripts/build-fs.mjs      varre content/ e art/ → src/generated/
content/<lang>/           espelha a raiz do filesystem simulado (etc, home, var)
art/banner*.txt           arte ASCII crua do boot; trocar = colar por cima
public/fonts/             JetBrains Mono auto-hospedada (README.md explica)
api/
├── main.py               FastAPI: as cinco rotas
├── probe.py              leitura de /proc e /sys, sem dependência externa
├── usage.py              o JSONL dos comandos e o agregado em memória
└── fake.py               snapshot sintético, para desenvolver fora do Linux
deploy/
├── nginx.conf            server na 8080: dist/ estático + proxy de /api
├── nginx-limits.conf     a zona de rate limit; vai em conf.d/, não em sites-*
└── portfolio-api.service unit do systemd para o uvicorn
src/
├── main.ts               monta tudo e inicia a sessão
├── storage.ts            localStorage: histórico e preferências
├── fs/
│   ├── path.ts           utilitários POSIX de caminho
│   ├── types.ts          FileNode | DirNode
│   └── vfs.ts            filesystem em memória (aceita escrita, não persiste)
├── shell/
│   ├── lexer.ts          tokenização, aspas, escapes
│   ├── parser.ts         pipelines + operadores
│   ├── glob.ts           expansão segmento a segmento
│   ├── env.ts            cwd, home, idioma, histórico
│   └── executor.ts       encadeia pipes, aplica redirects
├── commands/
│   ├── types.ts          contrato de comando (argv, stdin, piped) → stdout
│   ├── registry.ts       registro + geração de /usr/bin
│   ├── format.ts         colunas e formato do `ls -l`
│   ├── nav.ts            navegação
│   ├── text.ts           ferramentas de texto
│   ├── doom.ts           o comando `doom`
│   ├── font.ts           o comando `font`
│   ├── fun.ts           camada 4: sudo, rm, fortune, cowsay, matrix, crt
│   ├── stats.ts         o comando `stats`
│   ├── flags.ts          parsing de flags curtas, compartilhado
│   └── system.ts         camada 3: uname, uptime, free, df, ps, neofetch, top
├── system/
│   ├── stats.ts          cliente do /api/stats, com cache e SystemOffline
│   ├── proc.ts           /proc do filesystem simulado, lido da máquina real
│   ├── format.ts         tamanhos, tempos e tabelas no formato do coreutils
│   ├── top.ts            o laço de repintura do `top`
│   └── telemetry.ts      o lote de comandos e o agregado público
├── doom/
│   ├── runtime.ts        carrega o wasm, roda o laço, desenha no terminal
│   └── keymap.ts         teclado do navegador → códigos do DOOM
└── terminal/
    ├── terminal.ts       xterm.js + WebGL + fit
    ├── boot.ts           a sequência de boot, pulável
    ├── lineEditor.ts     edição de linha, histórico, atalhos
    ├── mobile.ts         barra de chips e o terminal acima do teclado
    ├── matrix.ts         a chuva digital
    └── completion.ts     Tab-completion de comando e caminho
wasm/
├── doomgeneric_wasm.c    backend ASCII do doomgeneric
├── fetch-sources.sh      baixa doomgeneric + WAD (só para recompilar)
└── build.sh              emcc → public/doom/
public/doom/              artefatos compilados, versionados
test/shell.test.ts        smoke test headless
```

**Comandos:** `npm run dev`, `npm run build`, `npm test`, `npm run fs`. A API sobe
à parte com `.venv/bin/python -m uvicorn api.main:app --port 8000`; o servidor do
Vite faz proxy de `/api` para lá, e em produção quem junta as duas coisas na mesma
origem é o nginx.
Para recompilar o DOOM: `./wasm/fetch-sources.sh && ./wasm/build.sh` (precisa do
emsdk; **não** é necessário para rodar nem para fazer deploy).

**Detalhe do line editor:** o redesenho não confia na posição implícita do
cursor. A linha é quebrada em pedaços do tamanho exato da tela e emitida com
`\r\n` explícito, então a conta de linha/coluna fecha mesmo com a linha
embrulhando em várias linhas — que é onde esse tipo de editor costuma quebrar.

**Adicionar um comando novo:** escrever um `CommandSpec` e registrá-lo. O `help`,
o `help --all`, o `man` e o `/usr/bin` se atualizam sozinhos a partir do registro.

---

## 4. Fora de escopo (decidido explicitamente)

- SEO, meta tags, Open Graph, preview de link em redes sociais
- Fallback HTML para JS desligado
- Blog / seção de posts
- Tela de login
- Formulário ou envio de email
- Captcha
- Shell real em container
- CI/CD

---

## 5. Plano de execução

Ordem definida por **risco**, não por facilidade.

### Fase 1 — Núcleo ✅ concluída em 2026-08-27

- [x] Terminal xterm.js + WebGL: input, prompt, histórico, Tab-completion
- [x] Parser do shell: tokenização, aspas, globs, `|`, `>`, `>>` (+ `&&`, `||`, `;`)
- [x] Build de `content/` → manifesto do filesystem (com mtime do git)
- [x] Comandos de navegação: `ls`, `cd`, `cat`, `pwd`, `tree`, `clear`, `help`,
      `man`, `history`, `exit`
- [x] Ferramentas de texto: `grep`, `echo`, `head`, `tail`, `wc`, `sort`, `uniq`,
      `find`
- [x] Persistência do histórico em `localStorage` + `~/.bash_history` espelhado
- [x] Suíte de teste sem navegador (`npm test`) — 46 casos cobrindo parser,
      globs, pipes, redirects, encadeamento e Tab-completion

**O que ficou de fora da fase 1, de propósito:**

- Boot: `main.ts` imprime duas linhas de placeholder. A sequência real é fase 3.
- Conteúdo: os `.txt` em `content/en/` são rascunhos marcados `[draft]`, só para
  a árvore existir e o `cd`/Tab terem o que morder. Texto real é fase 3.
- Fonte: a JetBrains Mono ainda não foi baixada — o `@font-face` já aponta para
  `/fonts/`, e o build avisa que os arquivos faltam. É fase 4.
- `/proc/*`: ainda não existe. Depende da API, que é fase 3.

### Fase 2 — Validação do risco técnico ✅ concluída em 2026-08-27

- [x] **Spike do DOOM**: compilar para WASM e fazer desenhar no xterm.js
- [x] Comando `doom` completo: buffer alternativo, teclado, Ctrl+C para sair
- [x] Carregamento sob demanda dos 4,5MB
- [x] Scripts de build e de obtenção das fontes

> Resistir à tentação de deixar o DOOM por último como recompensa. É a maior
> incógnita técnica do projeto e a única coisa que pode redefinir decisões já
> tomadas. O resto é trabalho conhecido. Descobrir na semana 2, não na semana 8.

**Valeu a pena ter feito cedo.** Não porque falhou — funcionou, com folga de 20x
no orçamento de frame — mas porque o caminho até lá revelou duas coisas que
teriam sido caras de descobrir depois: o busy-wait do `TryRunTics` (ver 2.8) e o
fato de que o `onData` do xterm.js não reporta soltura de tecla, o que obriga a
capturar o teclado no `window`. Nenhuma das duas aparece em tutorial nenhum.

**Detalhes medidos e decididos estão em 2.8.**

### Fase 3 — Alma

- [x] Boot sequence completo — concluído em 2026-08-27
- [x] API FastAPI + `neofetch`, `uptime`, `free`, `df`, `top` ao vivo, `ps`,
      `/proc/*` — concluído em 2026-08-27 (também `whoami`, `date`, `uname`)
- [ ] Conteúdo real escrito em inglês — `about.txt`, `experience/` e
      `projects/` já estão escritos; falta o `/var/log/career.log`, o único
      arquivo que ainda carrega o marcador de rascunho

### Fase 4 — Polimento

- [ ] Conteúdo em português + comando `lang`
- [x] Suporte a toque: barra de chips, fonte menor, `neofetch` sem arte em tela
      estreita — concluído em 2026-08-27
- [x] Telemetria + comando `stats` — concluído em 2026-08-27, com `/etc/privacy`
- [x] Easter eggs: `sudo`, `rm -rf /`, `cowsay`, `fortune`, `matrix`, `crt` —
      concluído em 2026-08-27
- [x] Auto-hospedar JetBrains Mono (Regular + Bold, `.woff2`) — concluído em
      2026-08-27, do release oficial e não do Google Fonts (ver 2.2)
- [x] Deploy: instalado no Pi, com o `deploy-portfolio` versionado — concluído em
      2026-08-27

### Critério de publicação

**Tudo pronto e polido antes de mostrar para qualquer pessoa ou postar no LinkedIn.**
Não há lançamento parcial.

---

## 6. Pendências em aberto

- **Escrever o `/var/log/career.log`** (último item que segura o fim da fase 3):
  é o que ainda está marcado `[draft — real content lands in phase 3]`, e só o
  Luiz tem a trajetória para montar a linha do tempo
- Escrever o conteúdo em português e ligar o comando `lang` — é o último item
  aberto da fase 4, e depende do conteúdo em inglês existir primeiro
- As frases do `fortune` são um chute inicial em `content/en/usr/share/fortunes`:
  trocar por frases que o Luiz de fato queira citar
- Decidir se o DOOM tem som (hoje é compilado sem)
