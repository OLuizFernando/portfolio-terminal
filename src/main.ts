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

const manifest = rawManifest as unknown as Manifest;

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
  env.lang = prefs.lang;
  env.fontSize = prefs.fontSize;
  env.history = loadHistory();

  // O terminal nasce em DEFAULT_FONT_SIZE; só se ajusta se a visita anterior
  // pediu outro tamanho, ou se esta é uma tela de toque.
  if (env.fontSize !== DEFAULT_FONT_SIZE) handle.setFontSize(env.fontSize);

  const vfs = new Vfs(mount(env.lang));
  const registry = buildRegistry();
  mountUsrBin(vfs, registry);
  mountProc(vfs);

  const system = new SystemClient();

  let alive = true;

  const syncBashHistory = () => {
    vfs.writeFile(`${env.home}/.bash_history`, env.history.map((line) => line + '\n').join(''), false, true);
  };
  syncBashHistory();

  const term: TerminalControl = {
    clear: () => handle.term.write('\x1b[2J\x1b[H'),
    write: (text) => handle.print(text),
    writeBytes: (data, done) => handle.term.write(data, done),
    cellAspect: () => handle.cellAspect(),
    setFontSize: (size) => handle.setFontSize(size),
    exit: () => {
      alive = false;
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

  const ctx: ShellContext = {
    vfs,
    env,
    term,
    registry,
    system,
    savePrefs: () => savePrefs({ lang: env.lang, fontSize: env.fontSize }),
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

  handle.term.focus();

  void runBoot({
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
  }).finally(() => {
    booting = false;
    editor.start();
  });
}

main();
