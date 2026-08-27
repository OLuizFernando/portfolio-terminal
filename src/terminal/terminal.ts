import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';

import { DEFAULT_FONT_SIZE } from '../shell/env';

export interface TerminalHandle {
  term: Terminal;
  fit(): void;
  /** Escreve texto com `\n` normal, convertendo para o CRLF que o terminal quer. */
  print(text: string): void;
  /**
   * Largura dividida pela altura de uma célula, medida de verdade no DOM.
   *
   * Chutar esse valor deforma qualquer imagem desenhada em caracteres, e ele
   * muda com a fonte e com a altura de linha — então é medido, não constante.
   */
  cellAspect(): number;
  /** Troca o tamanho da fonte e refaz o layout. Devolve como voltar ao que era. */
  setFontSize(size: number): () => void;
}

const BASE_LINE_HEIGHT = 1.2;

export function createTerminal(element: HTMLElement): TerminalHandle {
  const term = new Terminal({
    convertEol: false,
    cursorBlink: true,
    cursorStyle: 'block',
    fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: DEFAULT_FONT_SIZE,
    lineHeight: BASE_LINE_HEIGHT,
    letterSpacing: 0,
    scrollback: 5000,
    // Custo zero e é o que torna o terminal legível por leitor de tela.
    screenReaderMode: true,
    theme: {
      background: '#000000',
      foreground: '#ffffff',
      cursor: '#ffffff',
      cursorAccent: '#000000',
      selectionBackground: '#ffffff',
      selectionForeground: '#000000',
    },
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(element);

  // WebGL é o que sustenta o DOOM em 30+ fps na grade de texto. Sem ele o
  // terminal ainda funciona, só mais devagar.
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => webgl.dispose());
    term.loadAddon(webgl);
  } catch {
    console.warn('[terminal] WebGL indisponível, seguindo no renderer padrão');
  }

  const fit = () => {
    try {
      fitAddon.fit();
    } catch {
      /* elemento ainda sem layout */
    }
  };

  fit();

  new ResizeObserver(fit).observe(element);
  window.addEventListener('orientationchange', () => setTimeout(fit, 100));
  element.addEventListener('click', () => term.focus());

  // Depois de um reload o documento pode ganhar o foco só depois do `focus()`
  // inicial, e a primeira tecla se perde. Reconquista o foco quando isso ocorre.
  const refocus = () => {
    if (!element.contains(document.activeElement)) term.focus();
  };
  window.addEventListener('focus', refocus);
  document.addEventListener('keydown', refocus, true);

  const cellAspect = (): number => {
    const screen = term.element?.querySelector('.xterm-screen') as HTMLElement | null;
    if (screen && term.cols > 0 && term.rows > 0) {
      const width = screen.clientWidth / term.cols;
      const height = screen.clientHeight / term.rows;
      if (width > 0 && height > 0) return width / height;
    }
    return 0.5; // proporção típica de célula monoespaçada
  };

  const setFontSize = (size: number) => {
    const previous = term.options.fontSize ?? DEFAULT_FONT_SIZE;
    term.options.fontSize = size;
    fit();
    return () => {
      term.options.fontSize = previous;
      fit();
    };
  };

  return {
    term,
    fit,
    cellAspect,
    setFontSize,
    print: (text: string) => term.write(text.replace(/(?<!\r)\n/g, '\r\n')),
  };
}
