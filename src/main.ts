import './styles.css';

import rawManifest from './generated/manifest.json';
import { buildRegistry, mountUsrBin } from './commands/registry';
import type { ShellContext, TerminalControl } from './commands/types';
import type { DirNode, Manifest } from './fs/types';
import { Vfs } from './fs/vfs';
import { DEFAULT_FONT_SIZE, Env } from './shell/env';
import { execute } from './shell/executor';
import { complete } from './terminal/completion';
import { LineEditor } from './terminal/lineEditor';
import { createTerminal } from './terminal/terminal';
import { loadHistory, loadPrefs, saveHistory, savePrefs } from './storage';

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
  const prefs = loadPrefs();
  const env = new Env();
  env.lang = prefs.lang;
  env.fontSize = prefs.fontSize;
  env.history = loadHistory();

  // Preferência de fonte guardada de uma visita anterior.
  if (env.fontSize !== DEFAULT_FONT_SIZE) handle.setFontSize(env.fontSize);

  const vfs = new Vfs(mount(env.lang));
  const registry = buildRegistry();
  mountUsrBin(vfs, registry);

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

  handle.term.onData((data) => {
    if (alive) editor.handle(data);
  });

  // Placeholder do boot: a sequência completa (POST, banner, dados reais do Pi)
  // é da fase 3. Por ora, só o mínimo para o prompt fazer sentido.
  handle.print(
    `Linux ${env.host} 6.6.0-rpi #1 SMP aarch64\n\n` +
      `Type 'help' to get started, 'ls' to look around.\n\n`,
  );

  // Gancho de desenvolvimento: dá acesso ao terminal pelo console para medir
  // throughput de escrita. Não existe no build de produção.
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__term = handle.term;
  }

  editor.start();
  handle.term.focus();
}

main();
