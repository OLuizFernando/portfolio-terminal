# portfolio-terminal

A personal portfolio with no UI. It is a simulated Unix terminal: black screen,
a boot sequence printed line by line, and then a prompt. Everything about me
lives in a simulated filesystem you explore with `ls`, `cd`, `cat` and `grep`.

**Live at [oluizfernando.com.br](https://oluizfernando.com.br)** — served from a
Raspberry Pi 5 on a desk in Brazil.

```
guest@oluizfernando:~$ ls
README.txt  about.txt  contact.txt  education/  experience/  projects/  skills.txt
guest@oluizfernando:~$ cat projects/*/stack.txt | grep -i typescript
```

## What makes it more than a gimmick

The machine is real. `neofetch`, `uptime`, `free`, `top`, `ps` and
`cat /proc/cpuinfo` return **live readings from the Raspberry Pi that is serving
the page at that moment** — model, kernel, load average, CPU temperature, memory,
the actual process list. Nothing is pre-written, and nothing is faked: when the
API cannot be reached, commands say `cannot reach the machine` instead of
inventing a number, and when the API runs off Linux (a Mac, in development) the
response is flagged `synthetic: true` and the terminal prints the warning.

The timestamps in `ls -l` are the dates of the git commits that last touched each
file. `doom` is the real game.

## Try these

**Navigation and utilities** — `ls` (`-a`, `-l`), `cd`, `pwd`, `cat`, `tree`,
`clear`, `help`, `help --all`, `man <cmd>`, `history`, `font`, `reboot`, `exit`

**Text** — `grep`, `echo`, `head`, `tail`, `wc`, `sort`, `uniq`, `find` — with
real pipes, redirects (`>`, `>>`) and chaining (`&&`, `||`, `;`), so `ls | wc -l`
counts files rather than columns

**The machine** — `whoami`, `uname -a`, `uptime`, `date`, `neofetch`, `free`,
`df`, `ps`, `top` (live, repaints every 2s until `q`)

**Personality** — `doom`, `sudo`, `cowsay`, `matrix`, `crt`, `stats`, `lang`,
and a destructive path that actually empties the tree and leaves exactly one
file behind

Tab completes commands and paths; double Tab lists ambiguities. `Ctrl+C` cancels
the line, `Ctrl+L` clears the screen, ↑/↓ walk the history — which persists in
`localStorage` and is readable at `~/.bash_history`.

Mobile is supported for real: touching the screen raises the system keyboard, and
a bar of seven chips (`ls`, `cd ..`, `cat`, `Tab`, `↑`, `help`, `^C`) sits above
it. DOOM is desktop-only.

## Running it

```bash
npm install
npm run dev       # vite, with the filesystem manifest regenerated first
npm run build     # tsc --noEmit && vite build → dist/
npm test          # 157 headless smoke tests (esbuild + node, no browser)
npm run fs        # regenerate src/generated/manifest.json by hand
```

The API is a separate service in `api/` (FastAPI):

```bash
python3 -m venv .venv && .venv/bin/pip install -r api/requirements.txt
.venv/bin/python -m uvicorn api.main:app --port 8000
```

Vite proxies `/api` to port 8000 in development; in production nginx is what puts
both on the same origin. The site is static and does not need the API to exist —
half of the system-command tests run with no server at all.

Recompiling DOOM is a different story: `./wasm/fetch-sources.sh && ./wasm/build.sh`,
which needs the emsdk. It is **not** required to run or to deploy — the compiled
artifacts are versioned in `public/doom/`.

## How it is built

```
Visitor
   │
   ▼
Cloudflare Tunnel (edge cache, no open port on the router)
   │
   ▼
Raspberry Pi 5 (8GB)
   ├── nginx :8080  → serves dist/ and proxies /api
   └── FastAPI/uvicorn (systemd) → /api/stats, /api/proc/{name}, /api/log,
                                   /api/usage, /api/health
```

**Frontend:** xterm.js with the WebGL renderer, Vite and TypeScript, **no
framework** — there is no UI state for a React to manage. What is written for
this project is the shell on top: lexer, parser, glob expansion, pipe/redirect
executor, an in-memory filesystem that accepts writes, a line editor that never
trusts the implicit cursor position, tab completion, and the boot sequence.

**Backend:** five routes whose whole job is to read `/proc` and `/sys` and hand
it over as JSON, with no external dependencies. `/api/stats` is cached for 2s so
a live `top` does not read `/proc` thirty times a second per visitor.

**Content:** every readable file is a plain `.txt` under `content/en/` and
`content/pt/`, mirroring the root of the simulated filesystem. A build script
walks the folders and generates the manifest the terminal loads — writing new
content means adding a `.txt` and committing it. Two files are generated instead
of written: `/etc/os-release` and `/usr/share/doc/portfolio/CHANGELOG` come from
`git log` at build time.

**Colour:** pure white on black, bold as the only emphasis, everywhere in the
shell. The two exceptions both live in the alternate buffer and are both asked
for: `matrix`, and `doom --color`, which is off by default.

## DOOM

`doom` is doomgeneric compiled to WebAssembly with emscripten at 320×200 — no
SDL, no canvas, no sound — with an ASCII backend written for this project
(`wasm/doomgeneric_wasm.c`). Frames are drawn **into the text grid of the
terminal itself**, two vertical pixels per character cell, only repainting the
cells that changed. It is not a canvas overlaid on the page; the metaphor stays
intact.

Measured in game on a 160×60 grid: 1.4ms per frame at p50 for the DOOM tick plus
the ASCII conversion, against a 28.6ms budget at 35fps. The 4.5MB of runtime and
WAD load on demand, only when someone types `doom`.

## Languages

English is the default for everyone. `lang pt` switches at runtime and the whole
machine follows — help, man pages, error messages, table labels, the decimal
separator, the boot text — but command names and flags never translate, because
no locale in the world translates `ls -l`. English strings live in the code;
`src/i18n/pt.ts` is a catalogue on top, and TypeScript refuses to compile a new
key that has no Portuguese. The language never switches on its own from browser
detection: the boot only prints a hint.

## Privacy

Typed commands are logged, and `cat /etc/privacy` says so in writing, in advance.
What is stored is the **first word** of the line and whether it is a real command
— `cd projects` becomes `cd`. No IP, no cookie, no session identifier, not even a
random one, and the timestamp is the server's on arrival. It feeds the public
`stats` command: most-typed commands, and which non-existent commands people try
most.

## Deploy

Manual, on purpose, and the build runs on the Pi: `ssh raspberrypi deploy-portfolio`.
The logic lives in `deploy/deploy.sh`, versioned alongside everything else; it
compares the commit before with the commit after and decides what to redo — venv,
`npm ci`, the systemd unit, the nginx config — then checks `/api/health` and fails
if the site is not actually up. There is no CI, and there is no GitHub webhook:
the reason the Cloudflare Tunnel exists is that nothing from outside reaches the
Pi.

## Repository layout

```
src/
├── main.ts           wires everything together and starts the session
├── fs/               POSIX paths, node types, the in-memory filesystem
├── shell/            lexer, parser, globs, environment, executor
├── i18n/             the English catalogue (source) and the Portuguese one
├── commands/         one module per layer; the registry generates /usr/bin
├── system/           the /api/stats client, /proc, coreutils-style formatting
├── doom/             the wasm runtime loop and the keymap
└── terminal/         xterm.js, boot, line editor, mobile bar, completion
content/<lang>/       mirrors the root of the simulated filesystem
art/                  raw ASCII art for the boot banner
scripts/build-fs.mjs  walks content/ and art/ → src/generated/
api/                  FastAPI: routes, /proc probes, usage log, synthetic mode
deploy/               nginx config, rate-limit zone, systemd unit, deploy script
wasm/                 the ASCII backend and the scripts to rebuild DOOM
public/doom/          compiled artifacts, versioned
test/shell.test.ts    the headless smoke test
```

Adding a command means writing a `CommandSpec` and registering it — `help`,
`help --all`, `man` and `/usr/bin` all update themselves from the registry — plus
a `ptDocs` entry and any new message in both catalogues, which the test suite and
the type checker respectively refuse to let you forget.

## Documentation

`CLAUDE.md` holds the conventions, the closed decisions and the traps that already
cost time. It is written in Portuguese, as are the code comments and the rest of
the internal documentation; the code, identifiers, commit messages and terminal
output are English, and this README is the one document written for people
arriving from outside.

The site documents itself, too: `cat /etc/fstab` says where every part of the tree
comes from, `cat /usr/share/doc/portfolio/COLOPHON` says what the site is made of,
and `cat /etc/privacy` says what is logged.

## Credits

- **DOOM** — [doomgeneric](https://github.com/ozkl/doomgeneric) by ozkl, on id
  Software's DOOM source (GPL-2.0), with `doom1.wad`, the shareware episode id
  has distributed freely since 1993.
- **JetBrains Mono** — self-hosted from the official release under the SIL Open
  Font License; see `public/fonts/README.md` for why not from Google Fonts.
- **[xterm.js](https://xtermjs.org/)** — the terminal, and half of what makes
  this possible.
