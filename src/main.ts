import './styles.css';

import rawManifest from './generated/manifest.json';
import { buildRegistry, mountUsrBin } from './commands/registry';
import type { ShellContext, TerminalControl } from './commands/types';
import type { DirNode, Manifest } from './fs/types';
import { Vfs } from './fs/vfs';
import { DEFAULT_FONT_SIZE, Env, TOUCH_FONT_SIZE } from './shell/env';
import { execute } from './shell/executor';
import { complete } from './terminal/completion';
import { LineEditor } from './terminal/lineEditor';
import { runBoot } from './terminal/boot';
import { isTouch, setupTouch } from './terminal/mobile';
import { createTerminal } from './terminal/terminal';
import { loadHistory, loadPrefs, saveHistory, savePrefs } from './storage';
import { mountProc } from './system/proc';
import { SystemClient } from './system/stats';
import { firstWord, Telemetry } from './system/telemetry';

const manifest = rawManifest as unknown as Manifest;

/** Os idiomas que o build encontrou em `content/`. O `lang` só aceita estes. */
const LANGS = Object.keys(manifest.langs);

/** Clona a árvore do manifesto: o filesystem aceita escrita e não pode sujar o original. */
function mount(lang: string): DirNode {
  const root = manifest.langs[lang] ?? Object.values(manifest.langs)[0];
  if (!root) throw new Error('manifesto vazio: rode `npm run fs`');
  return structuredClone(root);
}

function main(): void {
  const element = document.getElementById('terminal');
  if (!element) throw new Error('#terminal não existe');

  const handle = createTerminal(element);
  const env = new Env();
  env.defaultFontSize = isTouch() ? TOUCH_FONT_SIZE : DEFAULT_FONT_SIZE;

  const prefs = loadPrefs(env.defaultFontSize);
  // Uma preferência guardada pode apontar para um idioma que saiu do build. O
  // `mount` já cai no primeiro; o `env` precisa concordar com ele, senão o
  // `lang` mostraria um idioma que não é o que está na tela.
  env.lang = LANGS.includes(prefs.lang) ? prefs.lang : (LANGS[0] ?? 'en');
  env.fontSize = prefs.fontSize;
  env.crt = prefs.crt;
  env.history = loadHistory();

  // O terminal nasce em DEFAULT_FONT_SIZE; só se ajusta se a visita anterior
  // pediu outro tamanho, ou se esta é uma tela de toque.
  if (env.fontSize !== DEFAULT_FONT_SIZE) handle.setFontSize(env.fontSize);

  const vfs = new Vfs(mount(env.lang));
  const registry = buildRegistry();
  mountUsrBin(vfs, registry);
  mountProc(vfs);

  const system = new SystemClient();
  const telemetry = new Telemetry();

  // O efeito é uma classe no <body>: o canvas do xterm não responde a
  // text-shadow, então quem desenha scanline e vinheta é o CSS por cima dele.
  const setCrt = (on: boolean) => document.body.classList.toggle('crt', on);
  setCrt(env.crt);

  let alive = true;

  const syncBashHistory = () => {
    // Depois de um `rm -rf /` o home não existe mais, e o `writeFile` recriaria
    // o diretório inteiro só para guardar o histórico — ressuscitando por baixo
    // do pano justamente o que o visitante acabou de apagar. O `reboot` remonta
    // a árvore antes de chamar isto, então o histórico volta com ela.
    if (!vfs.isDir(env.home)) return;
    vfs.writeFile(`${env.home}/.bash_history`, env.history.map((line) => line + '\n').join(''), false, true);
  };
  syncBashHistory();

  const term: TerminalControl = {
    clear: () => handle.term.write('\x1b[2J\x1b[H'),
    write: (text) => handle.print(text),
    writeBytes: (data, done) => handle.term.write(data, done),
    cellAspect: () => handle.cellAspect(),
    setFontSize: (size) => handle.setFontSize(size),
    setCrt,
    exit: () => {
      alive = false;
      telemetry.stop();
      editor.dispose();
      handle.print('\nlogout\nConnection to oluizfernando closed.\n');
    },
    get cols() {
      return handle.term.cols;
    },
    get rows() {
      return handle.term.rows;
    },
  };

  // Trocar a árvore leva junto o que não veio do manifesto: `/usr/bin`, o
  // `/proc` e o `~/.bash_history` são montados por cima e precisam ser refeitos,
  // ou o `lang` deixaria o visitante sem comandos e sem histórico.
  const remount = (lang: string) => {
    vfs.remount(mount(lang));
    mountUsrBin(vfs, registry);
    mountProc(vfs);
    syncBashHistory();
  };

  // O boot roda duas vezes: quando a página abre e quando o `reboot` pede. A
  // dica de idioma só na primeira — na segunda o visitante já escolheu.
  const boot = (hint?: string) =>
    runBoot({
      langHint: hint,
      output: {
        print: (text) => handle.print(text),
        get cols() {
          return handle.term.cols;
        },
      },
      system,
      onSkippable: (skip) => {
        const listener = handle.term.onData(skip);
        return () => listener.dispose();
      },
    });

  const ctx: ShellContext = {
    vfs,
    env,
    term,
    registry,
    system,
    savePrefs: () => savePrefs({ lang: env.lang, fontSize: env.fontSize, crt: env.crt }),
    langs: LANGS,
    remount,
    reboot: async () => {
      remount(env.lang);
      env.cwd = env.home;
      env.oldcwd = env.home;
      // `3J` leva a rolagem junto: reiniciar e deixar o cadáver da sessão
      // anterior rolável acima do boot não seria reiniciar coisa nenhuma.
      handle.term.write('\x1b[2J\x1b[3J\x1b[H');
      await boot();
    },
  };

  const editor = new LineEditor(handle.term, {
    prompt: () => `${env.user}@${env.host}:${env.shortCwd}$ `,
    complete: (line, cursor) => complete(line, cursor, { vfs, env, registry }),
    history: env.history,
    onHistoryChange: (history) => {
      saveHistory(history);
      syncBashHistory();
    },
    submit: async (line) => {
      if (line.trim() === '') return;
      telemetry.record(line, registry.has(firstWord(line)));
      const { output } = await execute(line, ctx);
      if (output) handle.print(output);
    },
  });

  // Durante o boot o editor não existe para o teclado: as teclas só servem para
  // pular a sequência, e sairiam ecoando no meio do dmesg.
  let booting = true;

  handle.term.onData((data) => {
    if (alive && !booting) editor.handle(data);
  });

  // Os chips entram pelo `input` do xterm, não direto no editor: assim o toque
  // percorre o mesmo caminho que uma tecla de verdade — inclusive o de pular o
  // boot, que escuta os dados do terminal e não conhece o editor.
  setupTouch({
    frame: element,
    send: (data) => handle.term.input(data, true),
    focus: () => handle.term.focus(),
  });

  // Gancho de desenvolvimento: dá acesso ao terminal pelo console para medir
  // throughput de escrita. Não existe no build de produção.
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__term = handle.term;
  }

  // A aba indo embora é a última chance de mandar o lote pendente. O
  // `pagehide` cobre o fechamento; o `hidden` cobre trocar de aba no celular,
  // que muitas vezes é o fim da visita sem nunca disparar um `pagehide`.
  window.addEventListener('pagehide', () => telemetry.close());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') telemetry.close();
  });

  handle.term.focus();

  // O navegador é consultado uma vez, só para decidir se vale oferecer. Quem
  // troca é o visitante (DESIGN.md 2.6): detecção automática tiraria dele a
  // agência que é a alma do projeto.
  const speaksPt = navigator.language?.toLowerCase().startsWith('pt') ?? false;
  const langHint =
    speaksPt && LANGS.includes('pt') && env.lang !== 'pt'
      ? "dica: execute 'lang pt' para português"
      : undefined;

  void boot(langHint).finally(() => {
    booting = false;
    editor.start();
  });
}

main();
