/**
 * Camada 3: os comandos que leem a máquina de verdade.
 *
 * Tudo aqui vem de uma requisição só ao /api/stats. Quando ela falha, cada
 * comando avisa e o resto do terminal segue vivo — o site é estático, a API é
 * enfeite.
 */

import { runTop } from '../system/top';
import { clock, cpuTime, human, load, table, uptimeLong, uptimeShort } from '../system/format';
import { SystemOffline, type Stats } from '../system/stats';
import { parseFlags } from './flags';
import { fail, fromLines, ok, type CommandResult, type CommandSpec, type Invocation } from './types';

/**
 * Embrulha um comando que precisa da máquina: valida as flags, busca o snapshot
 * e transforma a ausência da máquina numa mensagem em vez de numa exceção.
 *
 * As flags são conferidas ANTES da rede. Um `free -z` está errado com ou sem
 * Pi do outro lado, e responder "cannot reach the machine" a um erro de digitação
 * manda o visitante procurar o problema no lugar errado.
 */
function needsMachine(
  spec: Omit<CommandSpec, 'run'> & { flags?: string },
  run: (stats: Stats, flags: Set<string>, invocation: Invocation) => CommandResult | Promise<CommandResult>,
): CommandSpec {
  return {
    ...spec,
    async run(invocation: Invocation) {
      const { flags, error } = parseFlags(invocation.argv, spec.flags ?? '', spec.name);
      if (error) return fail(error, 2);

      try {
        return await run(await invocation.ctx.system.snapshot(), flags, invocation);
      } catch (caught) {
        if (caught instanceof SystemOffline) {
          return fail(`${spec.name}: cannot reach the machine\n`);
        }
        throw caught;
      }
    },
  };
}

const whoami: CommandSpec = {
  name: 'whoami',
  summary: 'print the current user',
  usage: 'whoami',
  man: 'You are a guest. Everyone is.',
  run: ({ ctx }: Invocation) => ok(`${ctx.env.user}\n`),
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const date: CommandSpec = {
  name: 'date',
  summary: 'print the current date and time',
  usage: 'date',
  man: 'Prints your clock, in your timezone — not the machine\'s. The Pi lives in\nBrazil; you may not.',
  run() {
    const now = new Date();
    // O deslocamento do JS é invertido em relação ao que o `date` imprime.
    const offset = -now.getTimezoneOffset();
    const sign = offset < 0 ? '-' : '+';
    const absolute = Math.abs(offset);
    const zone = `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}${String(absolute % 60).padStart(2, '0')}`;
    const day = String(now.getDate()).padStart(2, ' ');
    return ok(
      `${WEEKDAYS[now.getDay()]} ${MONTHS[now.getMonth()]} ${day} ${clock(now)} ${zone} ${now.getFullYear()}\n`,
    );
  },
};

const uname = needsMachine(
  {
    name: 'uname',
    summary: 'print system information',
    usage: 'uname [-a] [-s] [-r] [-v] [-m]',
    man:
      'Identifies the machine.\n\n' +
      '  -s   kernel name (the default)\n' +
      '  -r   kernel release\n' +
      '  -v   kernel version\n' +
      '  -m   hardware architecture\n' +
      '  -a   all of it',
    flags: 'asrvm',
  },
  (stats, flags) => {
    const { release, version, machine } = stats.kernel;
    if (flags.has('a')) return ok(`Linux ${stats.hostname} ${release} ${version} ${machine} GNU/Linux\n`);

    const parts: string[] = [];
    if (flags.has('s') || flags.size === 0) parts.push('Linux');
    if (flags.has('r')) parts.push(release);
    if (flags.has('v')) parts.push(version);
    if (flags.has('m')) parts.push(machine);
    return ok(parts.join(' ') + '\n');
  },
);

const uptime = needsMachine(
  {
    name: 'uptime',
    summary: 'how long the machine has been up',
    usage: 'uptime',
    man: 'Time since the last boot, and the load average over 1, 5 and 15 minutes.\nThis is a real number from a real machine.',
  },
  (stats) =>
    ok(` ${clock()} up ${uptimeShort(stats.uptimeSec)},  load average: ${load(stats.load.avg)}\n`),
);

const free = needsMachine(
  {
    name: 'free',
    summary: 'show memory usage',
    usage: 'free [-h]',
    man: 'Memory on the machine serving this page.\n\n  -h   human readable sizes instead of kilobytes',
    flags: 'h',
  },
  (stats, flags) => {
    const size = flags.has('h') ? (kb: number) => human(kb, 'i') : (kb: number) => String(kb);
    const { mem } = stats;

    const rows = [
      ['', 'total', 'used', 'free', 'shared', 'buff/cache', 'available'],
      [
        'Mem:',
        size(mem.totalKb),
        size(mem.usedKb),
        size(mem.freeKb),
        size(mem.sharedKb),
        size(mem.buffCacheKb),
        size(mem.availableKb),
      ],
      ['Swap:', size(mem.swapTotalKb), size(mem.swapUsedKb), size(mem.swapFreeKb)],
    ];

    return ok(fromLines(table(rows, [false, true, true, true, true, true, true], 2)));
  },
);

const df = needsMachine(
  {
    name: 'df',
    summary: 'show disk usage',
    usage: 'df [-h]',
    man: 'Disk usage of the real filesystems on the machine.\n\n  -h   human readable sizes instead of 1K blocks',
    flags: 'h',
  },
  (stats, flags) => {
    const size = flags.has('h') ? (kb: number) => human(kb) : (kb: number) => String(kb);
    const rows = [
      ['Filesystem', flags.has('h') ? 'Size' : '1K-blocks', 'Used', 'Avail', 'Use%', 'Mounted on'],
      ...stats.disks.map((disk) => [
        disk.device,
        size(disk.sizeKb),
        size(disk.usedKb),
        size(disk.availKb),
        `${disk.usePct}%`,
        disk.mount,
      ]),
    ];

    return ok(fromLines(table(rows, [false, true, true, true, true, false])));
  },
);

const ps = needsMachine(
  {
    name: 'ps',
    summary: 'list running processes',
    usage: 'ps [aux]',
    man:
      'The processes actually running on the machine right now. Sorted by CPU,\n' +
      'capped at the busiest few.\n\n' +
      'Yes, these are real. That is the point of the command.',
  },
  (stats) => {
    const rows = [
      ['USER', 'PID', '%CPU', '%MEM', 'RSS', 'S', 'TIME', 'COMMAND'],
      ...stats.processes.map((process) => [
        process.user,
        String(process.pid),
        process.cpuPct.toFixed(1),
        process.memPct.toFixed(1),
        String(process.rssKb),
        process.state,
        cpuTime(process.timeSec),
        process.command,
      ]),
    ];

    return ok(fromLines(table(rows, [false, true, true, true, true, false, true, false])));
  },
);

/** O bloco de texto do neofetch, sem o desenho. Reaproveitado pelo boot. */
export function neofetchLines(stats: Stats, user: string, host: string): string[] {
  const root = stats.disks.find((disk) => disk.mount === '/') ?? stats.disks[0];
  const { cpu } = stats;

  const lines = [
    `${user}@${host}`,
    '-'.repeat(user.length + host.length + 1),
    `Host: ${stats.model}`,
    `Kernel: ${stats.kernel.release} ${stats.kernel.machine}`,
    `Uptime: ${uptimeLong(stats.uptimeSec)}`,
    `Shell: this one, written by hand`,
    `Terminal: xterm.js`,
    `CPU: ${cpu.name} (${cpu.cores}) @ ${(cpu.mhz / 1000).toFixed(2)}GHz`,
    `Load: ${load(stats.load.avg)}`,
  ];

  if (cpu.tempC !== null) lines.push(`Temp: ${cpu.tempC.toFixed(1)}C`);
  lines.push(`Memory: ${Math.round(stats.mem.usedKb / 1024)}MiB / ${Math.round(stats.mem.totalKb / 1024)}MiB`);
  if (root) lines.push(`Disk (/): ${human(root.usedKb)} / ${human(root.sizeKb)} (${root.usePct}%)`);
  if (stats.synthetic) lines.push('', 'NOTE: synthetic data — this is not the Pi.');

  return lines;
}

/** A framboesa. Só ASCII: a fonte é a JetBrains Mono, sem variante Nerd Font. */
const RASPBERRY = [
  '   .~~.   .~~.  ',
  "  '. \\ ' ' / .' ",
  '   .~ .~~~..~.  ',
  "  : .~.'~'.~. : ",
  ' ~ (   ) (   ) ~',
  "( : '~'.~.'~' : )",
  ' ~ .~ (   ) ~. ~',
  "  (  : '~' :  )  ",
  "   '~ .~~~. ~'   ",
  "       '~'       ",
];

const neofetch = needsMachine(
  {
    name: 'neofetch',
    summary: 'show what this machine is',
    usage: 'neofetch',
    primary: true,
    man:
      'The machine you are talking to, described by itself.\n\n' +
      'Every number here was read from /proc a moment ago. The temperature is\n' +
      'the actual temperature of a board on a shelf in Brazil.',
  },
  (stats, _flags, { ctx, piped }) => {
    const info = neofetchLines(stats, ctx.env.user, ctx.env.host);

    // No pipe não vai desenho nem negrito: `neofetch | grep Temp` tem que
    // devolver a linha, não arte com escapes no meio.
    if (piped) return ok(fromLines(info));

    const width = Math.max(...RASPBERRY.map((line) => line.length));
    const height = Math.max(RASPBERRY.length, info.length);
    const lines: string[] = [];

    for (let index = 0; index < height; index++) {
      const art = (RASPBERRY[index] ?? '').padEnd(width);
      const text = info[index] ?? '';
      // As duas primeiras linhas do bloco são o cabeçalho `user@host` e o traço.
      lines.push(`${art}   ${index < 2 ? `\x1b[1m${text}\x1b[0m` : text}`.trimEnd());
    }

    return ok(fromLines(lines));
  },
);

const top: CommandSpec = {
  name: 'top',
  summary: 'watch the machine live',
  usage: 'top',
  man:
    'Repaints every two seconds with what the machine is doing, until you press\n' +
    'q. This is the command where it stops being a metaphor.',
  async run({ ctx, piped }: Invocation) {
    if (piped) {
      // O `top` de verdade também recusa: sem terminal não há tela para repintar.
      return fail('top: cannot write to a pipe — try `ps` instead\n', 2);
    }

    try {
      await runTop(ctx);
      return ok('');
    } catch (error) {
      if (error instanceof SystemOffline) return fail('top: cannot reach the machine\n');
      throw error;
    }
  },
};

export const systemCommands: CommandSpec[] = [whoami, date, uname, uptime, free, df, ps, neofetch, top];
