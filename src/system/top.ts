/**
 * O `top`: a máquina se repintando ao vivo dentro do terminal.
 *
 * É o comando que fecha a ideia do site. `neofetch` mostra números que poderiam
 * estar escritos num arquivo; o `top` mudando sozinho, não. Por isso ele existe
 * mesmo custando um laço de repintura e captura de teclado.
 */

import type { ShellContext } from '../commands/types';
import { clock, cpuTimePlus, load, mib, table, uptimeShort } from './format';
import { fixed, t } from '../i18n';
import type { Stats } from './stats';

/** O servidor cacheia por 2s. Repintar mais rápido mostraria o mesmo snapshot. */
const INTERVAL_MS = 2000;

/** Linhas do cabeçalho e do rodapé, que não podem ser ocupadas por processo. */
const CHROME_ROWS = 8;

function header(stats: Stats): string[] {
  const { mem, cpu } = stats;

  return [
    t().topFirstLine(clock(), uptimeShort(stats.uptimeSec), load(stats.load.avg)),
    t().topTasks(stats.load.total, stats.load.running),
    t().topCpu(fixed(cpu.usagePct, 1), cpu.tempC === null ? null : fixed(cpu.tempC, 1)),
    t().topMem(mib(mem.totalKb), mib(mem.freeKb), mib(mem.usedKb), mib(mem.buffCacheKb)),
    t().topSwap(mib(mem.swapTotalKb), mib(mem.swapFreeKb), mib(mem.swapUsedKb), mib(mem.availableKb)),
    '',
  ];
}

function body(stats: Stats, rows: number): string[] {
  const visible = stats.processes.slice(0, Math.max(rows, 0));
  const table_ = table(
    [
      t().topColumns,
      ...visible.map((process) => [
        String(process.pid),
        process.user,
        fixed(process.cpuPct, 1),
        fixed(process.memPct, 1),
        String(process.rssKb),
        process.state,
        cpuTimePlus(process.timeSec),
        process.comm,
      ]),
    ],
    [true, false, true, true, true, false, true, false],
    2,
  );

  // O cabeçalho da tabela vai em negrito, como o do `top` de verdade — que usa
  // vídeo reverso, mas a paleta aqui é branco sobre preto e o destaque é negrito.
  const [head, ...rest] = table_;
  return [`\x1b[1m${head ?? ''}\x1b[0m`, ...rest];
}

/**
 * Roda até o visitante apertar `q`. Lança `SystemOffline` se a máquina não
 * responder à primeira leitura; depois disso, uma falha só congela os números —
 * sair no meio por causa de um pacote perdido seria pior do que mostrar o
 * snapshot anterior.
 */
export async function runTop(ctx: ShellContext): Promise<void> {
  const { term, system } = ctx;

  // A primeira leitura é fora do buffer alternativo: se a máquina estiver fora,
  // o erro sai no shell normal em vez de piscar uma tela cheia e voltar.
  let stats = await system.snapshot(0);

  term.write('\x1b[?1049h\x1b[?25l');

  let stopped = false;
  let timer = 0;
  let resolveDone: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const paint = () => {
    const width = term.cols;
    const lines = [
      ...header(stats),
      ...body(stats, term.rows - CHROME_ROWS),
      '',
      t().topQuit(stats.synthetic),
    ];

    // `\x1b[H` volta ao topo e cada linha se apaga sozinha com `\x1b[K`: repintar
    // com `\x1b[2J` pisca a tela inteira a cada dois segundos.
    const painted = lines
      .map((line) => (line.length > width ? line.slice(0, width) : line) + '\x1b[K')
      .join('\r\n');
    term.write(`\x1b[H${painted}\x1b[J`);
  };

  const tick = async () => {
    if (stopped) return;
    try {
      stats = await system.snapshot(0);
    } catch {
      /* a máquina sumiu: mantém o último snapshot e tenta de novo no próximo ciclo */
    }
    if (stopped) return;
    paint();
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'q' && event.key !== 'Escape' && !(event.ctrlKey && event.code === 'KeyC')) {
      return;
    }
    // Só engole a tecla que trata; o resto o xterm ignora sozinho porque o
    // terminal está no buffer alternativo.
    event.preventDefault();
    event.stopPropagation();
    stop();
  };

  function stop(): void {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    window.removeEventListener('keydown', onKey, true);
    term.write('\x1b[?25h\x1b[?1049l');
    resolveDone();
  }

  window.addEventListener('keydown', onKey, true);
  paint();
  timer = window.setInterval(() => void tick(), INTERVAL_MS);

  return done;
}
