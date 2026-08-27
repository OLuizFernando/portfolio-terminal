/**
 * A chuva digital.
 *
 * Mesma mecânica do `top`: buffer alternativo, cursor escondido, repintura por
 * intervalo, e a promessa só resolve quando o visitante sai. A diferença é que
 * aqui não há dado nenhum do outro lado — é o único comando da camada 4 que
 * desenha, e ele desenha do nada.
 */

import type { ShellContext } from '../commands/types';

/**
 * ~14 quadros por segundo. A chuva não fica mais bonita mais rápido, e cada
 * quadro reescreve a tela inteira — a mesma conta que limita o DOOM.
 */
const FRAME_MS = 70;

/** Quantas colunas caem ao mesmo tempo, em fração da largura da tela. */
const DENSITY = 0.7;

const MIN_TAIL = 6;
const MAX_TAIL = 22;

/** Katakana de meia largura, dígitos e alguns símbolos — todos de uma célula. */
const GLYPHS = [...'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789:.=*+-<>¦'];

/**
 * Índice 0 é o fundo. Escrever a cor célula a célula custaria dez bytes por
 * caractere; emitindo só na virada, uma linha inteira de fundo é um escape só.
 */
const COLORS = ['\x1b[0m', '\x1b[32m', '\x1b[92m', '\x1b[97m'];

const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)]!;
const between = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

interface Drop {
  /** Posição da cabeça. Fracionária porque cada gota cai na sua velocidade. */
  head: number;
  speed: number;
  tail: number;
  /** Os caracteres já sorteados desta coluna, por linha. */
  glyphs: string[];
}

const newDrop = (rows: number): Drop => ({
  head: -between(0, rows),
  speed: 0.4 + Math.random() * 0.9,
  tail: between(MIN_TAIL, MAX_TAIL),
  glyphs: [],
});

export function runMatrix(ctx: ShellContext): Promise<void> {
  const { term } = ctx;

  term.write('\x1b[?1049h\x1b[?25l');

  let cols = 0;
  let rows = 0;
  let drops = new Map<number, Drop>();

  const seed = () => {
    cols = term.cols;
    rows = term.rows;
    drops = new Map();
    const wanted = Math.round(cols * DENSITY);
    while (drops.size < wanted) {
      const column = Math.floor(Math.random() * cols);
      if (!drops.has(column)) drops.set(column, newDrop(rows));
    }
  };
  seed();

  const paint = () => {
    // Redimensionar no meio da chuva reinicia a grade: gota em coluna que não
    // existe mais desenharia fora da tela.
    if (term.cols !== cols || term.rows !== rows) seed();

    const chars: string[][] = Array.from({ length: rows }, () => new Array<string>(cols).fill(' '));
    const shades: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

    for (const [column, drop] of drops) {
      drop.head += drop.speed;
      const head = Math.floor(drop.head);

      for (let offset = 0; offset < drop.tail; offset++) {
        const row = head - offset;
        if (row < 0 || row >= rows) continue;
        if (drop.glyphs[row] === undefined) drop.glyphs[row] = pick(GLYPHS);
        chars[row]![column] = drop.glyphs[row]!;
        // A cabeça é branca, e o rastro vai do verde vivo ao verde escuro — é o
        // gradiente que dá a impressão de apagar.
        shades[row]![column] = offset === 0 ? 3 : offset < drop.tail / 3 ? 2 : 1;
      }

      if (head - drop.tail > rows) drops.set(column, newDrop(rows));
    }

    const painted: string[] = [];
    for (let row = 0; row < rows; row++) {
      let line = '';
      let shade = -1;
      for (let column = 0; column < cols; column++) {
        const next = shades[row]![column]!;
        if (next !== shade) {
          line += COLORS[next];
          shade = next;
        }
        line += chars[row]![column];
      }
      painted.push(line);
    }

    term.write(`\x1b[H${painted.join('\r\n')}`);
  };

  let stopped = false;
  let timer = 0;
  let resolveDone: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  // Qualquer tecla sai. Modificador sozinho não conta: quem faz ctrl+c aperta
  // duas teclas, e sairia já na primeira.
  const onKey = (event: KeyboardEvent) => {
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    stop();
  };

  function stop(): void {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    window.removeEventListener('keydown', onKey, true);
    term.write('\x1b[0m\x1b[?25h\x1b[?1049l');
    resolveDone();
  }

  window.addEventListener('keydown', onKey, true);
  paint();
  timer = window.setInterval(paint, FRAME_MS);

  return done;
}
