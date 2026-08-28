/**
 * A sequência de boot.
 *
 * Existe por uma razão só: dar tempo de o visitante entender onde entrou antes
 * de encarar um prompt vazio. Três segundos de texto correndo dizem "isto é uma
 * máquina" melhor do que qualquer parágrafo explicando que isto é uma máquina.
 *
 * Qualquer tecla pula para o fim — quem já viu não precisa ver de novo, e o
 * histórico do navegador traz visitante repetido.
 */

import art from '../generated/art.json';
import { fixed, t } from '../i18n';
import { human, uptimeLong } from '../system/format';
import { SystemOffline, type SystemClient, type Stats } from '../system/stats';

/**
 * Linhas de kernel, no formato do `dmesg`. Todas dizem a verdade sobre o Pi, e
 * nenhuma carrega número que se leia como estado vivo da máquina: memória e
 * temperatura só aparecem no bloco de sistema, que vem do /api/stats. Um
 * `Memory: ...K available` fixo aqui é lido como leitura real, contradiz o
 * `free` na mesma tela e faz o visitante achar que o site inteiro é cenário.
 */
const POST: [number, string][] = [
  [0.0, 'Booting Linux on physical CPU 0x0000000000 [0x414fd0b1]'],
  [0.0, 'Machine model: Raspberry Pi 5 Model B'],
  [0.418, 'SMP: Total of 4 processors activated.'],
  [2.031, 'sdhci: Secure Digital Host Controller Interface driver'],
  [2.455, 'systemd[1]: Detected architecture arm64.'],
  [3.017, 'Started nginx - A high performance web server.'],
  [3.284, 'Started portfolio-api.service.'],
  [3.502, 'Reached target Multi-User System.'],
];


const widthOf = (lines: string[]) => Math.max(0, ...lines.map((line) => [...line].length));

/**
 * Todo `art/banner*.txt` é um candidato, ordenado do mais largo para o mais
 * estreito. Acrescentar um tamanho é colar mais um arquivo naquele diretório;
 * nada aqui precisa mudar.
 */
const BANNERS: string[][] = Object.entries(art)
  .filter(([name, lines]) => name.startsWith('banner') && lines.length > 0)
  .map(([, lines]) => lines)
  .sort((a, b) => widthOf(b) - widthOf(a));

/**
 * O maior que couber inteiro. A arte nunca é embrulhada: embrulhada ela não fica
 * menor, fica quebrada. Se nem a menor couber — um celular muito estreito, ou
 * uma fonte muito grande — sobra o nome por extenso, que diz a mesma coisa sem
 * parecer defeito.
 */
function banner(cols: number): string[] {
  return BANNERS.find((lines) => widthOf(lines) <= cols) ?? ['OLuizFernando'];
}

export interface BootOutput {
  print(text: string): void;
  /** Largura da tela, para decidir se a arte cabe. */
  readonly cols: number;
}

/** Espera cancelável: depois que o visitante pula, toda pausa vira zero. */
class Clock {
  skipped = false;

  wait(ms: number): Promise<void> {
    if (this.skipped) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * O rótulo é preenchido a partir do mais largo do bloco, e não com um número
 * fixo de espaços: `memory` tem seis letras e `memória` tem sete, e alinhamento
 * escrito à mão só serve ao idioma em que foi escrito.
 */
function systemBlock(stats: Stats | null): string[] {
  if (!stats) return t().bootOffline;

  const root = stats.disks.find((disk) => disk.mount === '/') ?? stats.disks[0];
  const temperature = stats.cpu.tempC === null ? '' : ` at ${fixed(stats.cpu.tempC, 1)}C`;
  const label = t().bootLabels;

  const rows: [string, string][] = [
    [label.host, stats.model],
    [label.kernel, `${stats.kernel.release} ${stats.kernel.machine}`],
    [label.uptime, uptimeLong(stats.uptimeSec)],
    [
      label.cpu,
      `${stats.cpu.name} (${stats.cpu.cores}) @ ${fixed(stats.cpu.mhz / 1000, 2)}GHz${temperature}`,
    ],
    [
      label.memory,
      `${Math.round(stats.mem.usedKb / 1024)}MiB used of ${Math.round(stats.mem.totalKb / 1024)}MiB`,
    ],
  ];
  if (root) rows.push([label.disk, `${human(root.usedKb)} of ${human(root.sizeKb)} (${root.usePct}%)`]);
  if (stats.synthetic) rows.push([label.note, t().bootSynthetic]);

  // 12 é a coluna em que o bloco sempre começou, e o piso a preserva; um rótulo
  // mais longo que isso empurra a coluna em vez de encostar no valor.
  const width = Math.max(12, Math.max(...rows.map(([name]) => name.length)) + 2);
  return rows.map(([name, value]) => `  ${name.padEnd(width)}${value}`);
}

export interface BootOptions {
  output: BootOutput;
  system: SystemClient;
  /**
   * A dica de idioma, ou nada. Quem decide é o main, olhando o navegador — o
   * boot só imprime. O idioma nunca troca sozinho (2.6): a dica oferece, e
   * quem escolhe é o visitante.
   */
  langHint?: string | undefined;
  /** Registra o cancelador de "qualquer tecla pula". */
  onSkippable: (skip: () => void) => () => void;
}

export async function runBoot({ output, system, onSkippable, langHint }: BootOptions): Promise<void> {
  const clock = new Clock();
  const release = onSkippable(() => {
    clock.skipped = true;
  });

  // A busca começa junto com a primeira linha: quando o boot chegar ao bloco de
  // sistema, a resposta já veio, e o visitante não espera pela rede.
  const pending = system.snapshot(0).catch((error: unknown) => {
    // Máquina fora do ar é caso previsto e o boot segue sem o bloco de sistema.
    // Qualquer outra coisa é defeito, e o console é onde ele deve aparecer.
    if (!(error instanceof SystemOffline)) console.error('[boot]', error);
    return null;
  });

  const line = (text = '') => output.print(text + '\n');

  try {
    for (const [seconds, text] of POST) {
      line(`[${seconds.toFixed(6).padStart(11)}] ${text}`);
      await clock.wait(70);
    }

    await clock.wait(300);
    line();
    for (const row of banner(output.cols)) {
      line(`\x1b[1m${row}\x1b[0m`);
      await clock.wait(35);
    }

    line();
    // Aqui a resposta já chegou: a busca começou junto com a primeira linha do
    // POST, e o texto correndo cobriu a latência.
    for (const row of systemBlock(await pending)) {
      line(row);
      await clock.wait(55);
    }

    await clock.wait(250);
    line();
    line(t().bootWelcome);
    await clock.wait(150);
    line();
    if (langHint) {
      line(langHint);
      await clock.wait(150);
      line();
    }
    line(t().bootHelpHint);

    line();
  } finally {
    release();
  }
}
