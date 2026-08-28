import { fixed, t } from '../i18n';
import type { TerminalControl } from '../commands/types';
import { toDoomKey } from './keymap';
import doomBuild from '../generated/doom.json';

/** Superfície do módulo Emscripten que a gente realmente usa. */
interface DoomModule {
  HEAPU8: Uint8Array;
  _dg_start(): void;
  _dg_tick(): void;
  _dg_clock(): number;
  _dg_set_grid(cols: number, rows: number): void;
  _dg_set_color(on: number): void;
  _dg_set_origin(col: number, row: number): void;
  _dg_take_frame(): number;
  _dg_render(): number;
  _dg_invalidate(): void;
  _dg_ansi(): number;
  _dg_key(pressed: number, key: number): void;
}

type DoomFactory = (options?: Record<string, unknown>) => Promise<DoomModule>;

/** O DOOM é 320x200 exibido em 4:3. */
const IMAGE_ASPECT = 4 / 3;

/*
 * Os três arquivos em /doom/ têm nome fixo e são cacheados por 30 dias, então a
 * versão vai na query: sem ela a URL não muda quando o wasm é recompilado, e o
 * visitante que já jogou continua recebendo o loader velho do cache do próprio
 * navegador — que nenhum purge de CDN alcança.
 *
 * Vale para o doom.js E para o que o locateFile resolve. Versionar só o loader
 * deixaria o .wasm e o .data nas URLs antigas, que é o desencontro entre loader
 * e wasm que isto existe para impedir.
 */
const VERSION = `?v=${doomBuild.version}`;

const MODULE_PATH = `/doom/doom.js${VERSION}`;

/** Teto da grade no backend em C. Espelhado aqui para os dois lados concordarem. */
const MAX_GRID_COLS = 400;
const MAX_GRID_ROWS = 200;

let cachedFactory: DoomFactory | null = null;

async function loadFactory(): Promise<DoomFactory> {
  if (cachedFactory) return cachedFactory;

  // A URL é montada em runtime de propósito: o bundle do Vite não pode tentar
  // resolver esse import. O doom.js é artefato do emscripten, servido estático
  // de /public — o payload de 4MB só sai do servidor quando alguém digita
  // `doom`, e o cache de borda absorve as visitas seguintes.
  const url = new URL(MODULE_PATH, window.location.origin).href;
  const module = (await import(/* @vite-ignore */ url)) as { default: DoomFactory };
  cachedFactory = module.default;
  return cachedFactory;
}

/** Maior grade com a proporção certa que cabe na tela. */
function fitGrid(cols: number, rows: number, ratio: number): { cols: number; rows: number } {
  let width = Math.min(Math.max(1, cols), MAX_GRID_COLS);
  let height = Math.min(Math.max(1, rows), MAX_GRID_ROWS);
  if (width / height > ratio) width = Math.max(1, Math.floor(height * ratio));
  else height = Math.max(1, Math.floor(width / ratio));
  return { cols: width, rows: height };
}

/**
 * Espera o terminal assentar depois de uma troca de fonte, sem nunca travar:
 * aba em segundo plano estrangula o requestAnimationFrame, então há um teto.
 */
const settle = () =>
  new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    requestAnimationFrame(() => requestAnimationFrame(finish));
    setTimeout(finish, 100);
  });

export interface DoomOptions {
  showFps: boolean;
  /** Tamanho de fonte só durante o jogo. Sem isso, usa a do terminal. */
  fontSize?: number | undefined;
  /** Pinta o frame na paleta de 256 do terminal. Desligado, sai a rampa de sempre. */
  color?: boolean | undefined;
}

export interface DoomResult {
  frames: number;
  seconds: number;
  fps: number;
  cols: number;
  rows: number;
  worstTickMs: number;
}

/**
 * Roda o DOOM dentro do terminal e resolve quando o visitante sai com Ctrl+C.
 *
 * Usa o buffer alternativo da tela, como qualquer programa de terminal de
 * verdade: enquanto o jogo roda o shell fica intocado embaixo, e ao sair a
 * sessão reaparece exatamente como estava.
 */
export async function runDoom(term: TerminalControl, options: DoomOptions): Promise<DoomResult> {
  const factory = await loadFactory();
  // `locateFile` é obrigatório: sem ele o emscripten busca o doom.data relativo
  // à página, não ao módulo, e recebe de volta o index.html do servidor.
  const doom = await factory({ locateFile: (path: string) => `/doom/${path}${VERSION}` });

  // Por padrão o DOOM joga na fonte do terminal. `--font` encolhe só durante a
  // partida: como tudo acontece no buffer alternativo, o shell nunca vê a troca.
  const restoreFont = options.fontSize === undefined ? null : term.setFontSize(options.fontSize);

  term.write('\x1b[?1049h\x1b[?25l\x1b[2J');

  // A medição da célula só é confiável depois que o terminal aplicou a fonte
  // nova e refez o layout. Se a medida sair velha, o próprio laço corrige: ele
  // refaz o layout assim que cols/rows mudarem.
  if (restoreFont) await settle();

  let grid = { cols: 0, rows: 0 };
  let termCols = 0;
  let termRows = 0;

  function layout(): void {
    termCols = term.cols;
    termRows = term.rows;
    // A proporção da célula é medida, não chutada: ela muda com a fonte e com a
    // altura de linha, e errar nela achata a imagem.
    grid = fitGrid(termCols, termRows, IMAGE_ASPECT / term.cellAspect());
    doom._dg_set_grid(grid.cols, grid.rows);
    doom._dg_set_origin(
      Math.floor((termCols - grid.cols) / 2) + 1,
      Math.floor((termRows - grid.rows) / 2) + 1,
    );
    term.write('\x1b[2J');
    doom._dg_invalidate();
  }

  // Antes do layout: `dg_set_grid` já zera os acumuladores de cor, e assim a
  // primeira grade nasce no modo certo em vez de trocar no frame seguinte.
  doom._dg_set_color(options.color ? 1 : 0);

  layout();
  doom._dg_start();

  const onKey = (event: KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;

    // Ctrl+C sai do jogo, não atira. É a única tecla que o DOOM não vê.
    if (event.type === 'keydown' && event.ctrlKey && event.code === 'KeyC') {
      stop();
      return;
    }

    const key = toDoomKey(event);
    if (key !== null) doom._dg_key(event.type === 'keydown' ? 1 : 0, key);
  };

  let lastTic = 0;

  // Aba em segundo plano congela o requestAnimationFrame, mas o relógio do DOOM
  // continua andando. Sem isso, ao voltar o jogo tentaria recuperar centenas de
  // tics de uma vez e travaria por segundos.
  const onVisibility = () => {
    if (!document.hidden) lastTic = doom._dg_clock();
  };

  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  document.addEventListener('visibilitychange', onVisibility);

  let running = true;
  let handle = 0;
  let frames = 0;
  let fpsFrames = 0;
  let worstTick = 0;
  let tickMs = 0;
  let frameBytes = 0;
  const started = performance.now();
  let fpsSince = started;

  let resolveDone: (result: DoomResult) => void;
  const done = new Promise<DoomResult>((resolve) => {
    resolveDone = resolve;
  });

  function stop(): void {
    if (!running) return;
    running = false;
    cancelAnimationFrame(handle);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKey, true);
    document.removeEventListener('visibilitychange', onVisibility);

    // Sai da tela cheia antes de devolver a fonte, para o shell refluir já no
    // tamanho certo.
    term.write('\x1b[?25h\x1b[?1049l');
    restoreFont?.();

    const seconds = (performance.now() - started) / 1000;
    resolveDone({
      frames,
      seconds,
      fps: seconds > 0 ? frames / seconds : 0,
      cols: grid.cols,
      rows: grid.rows,
      worstTickMs: worstTick,
    });
  }

  /** Um frame pronto no wasm, ainda não entregue ao terminal. */
  let framePending = false;
  /** Há uma escrita em voo; o wasm não pode tocar no buffer que ela está lendo. */
  let writeBusy = false;

  const onWritten = () => {
    writeBusy = false;
    frames++;
    fpsFrames++;
  };

  function frame(now: number): void {
    if (!running) return;
    handle = requestAnimationFrame(frame);

    if (term.cols !== termCols || term.rows !== termRows) layout();

    // O rAF roda a 60Hz, o DOOM a 35. Só avança quando o relógio do próprio
    // jogo virar: assim o `TryRunTics` sempre encontra um tic pronto e nunca
    // entra no busy-wait.
    const tic = doom._dg_clock();
    if (tic !== lastTic) {
      lastTic = tic;

      const before = performance.now();
      try {
        doom._dg_tick();
      } catch (error) {
        console.error('[doom]', error);
        stop();
        return;
      }
      tickMs = performance.now() - before;
      if (tickMs > worstTick) worstTick = tickMs;

      if (doom._dg_take_frame()) framePending = true;
    }

    // Um frame por vez. Empurrar mais rápido do que o terminal consome só
    // acumula latência, e a fila desafoga em rajada — que é exatamente o que se
    // sente como engasgo.
    if (framePending && !writeBusy) {
      framePending = false;
      writeBusy = true;
      const length = doom._dg_render();
      frameBytes = length;
      const pointer = doom._dg_ansi();
      // HEAPU8 é trocado quando a memória cresce — nunca guardar a referência.
      term.writeBytes(doom.HEAPU8.subarray(pointer, pointer + length), onWritten);
    }

    if (options.showFps && now - fpsSince >= 500) {
      const fps = (fpsFrames * 1000) / (now - fpsSince);
      fpsFrames = 0;
      fpsSince = now;
      // O `\x1b[0m` na frente é o que impede o HUD de sair pintado com a cor da
      // última célula do frame quando `--color` está ligado.
      term.write(
        `\x1b[0m\x1b[${termRows};1H\x1b[K` +
          t().doomHud(
            fixed(fps, 1),
            grid.cols,
            grid.rows,
            fixed(tickMs, 2),
            fixed(worstTick, 1),
            fixed(frameBytes / 1024, 1),
          ),
      );
      // O HUD escreve por cima da imagem; sem isso o diff acharia que aquela
      // linha continua válida e o texto ficaria grudado na tela.
      doom._dg_invalidate();
    }
  }

  lastTic = doom._dg_clock();
  handle = requestAnimationFrame(frame);
  return done;
}
