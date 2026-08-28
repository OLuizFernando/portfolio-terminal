/**
 * O catálogo de mensagens do shell.
 *
 * O inglês mora aqui e é a fonte: `en` é a única implementação escrita à mão
 * duas vezes, e `pt` a preenche inteira porque o TypeScript exige a interface
 * completa — chave nova no inglês não compila até existir no português, que é a
 * garantia que um `Record<string, string>` não daria.
 *
 * O que NÃO entra aqui: nome de comando, flag e as linhas de POST do boot. Nome
 * e flag são a interface da máquina, e `LANG=pt_BR` não traduz `ls` nem `-l`; as
 * linhas de kernel saem do kernel, que fala inglês em qualquer locale.
 */

export interface Messages {
  /** Código BCP-47, para `toLocaleString`. */
  readonly locale: string;
  /** O que separa a casa decimal. `free -h` diz `7.9Gi` em inglês e `7,9Gi` aqui. */
  readonly decimal: string;

  // --- shell ---------------------------------------------------------------
  commandNotFound(name: string): string;
  tryHelp: string;
  redirectIsDir(target: string): string;
  syntaxNear(token: string): string;
  syntaxUnexpectedEnd: string;
  syntaxUnmatched(quote: string): string;

  // --- erros de arquivo, compartilhados por vários comandos ----------------
  noSuchFile(cmd: string, target: string): string;
  isDirectory(cmd: string, target: string): string;
  notDirectory(cmd: string, target: string): string;
  cannotAccess(cmd: string, target: string): string;
  invalidOption(cmd: string, flag: string): string;
  usageLine(text: string): string;
  offline(cmd: string): string;

  // --- ls, tree ------------------------------------------------------------
  lsTotal(count: number): string;
  treeCount(dirs: number, files: number): string;

  // --- help, man -----------------------------------------------------------
  helpHeader(all: boolean): string;
  helpFooter(all: boolean): string;
  manWhich: string;
  manNoEntry(name: string): string;
  manSections: { name: string; usage: string; description: string };

  // --- ferramentas de texto ------------------------------------------------
  grepBadRegex(pattern: string): string;
  badLineCount: string;
  wcTotal: string;

  // --- find ----------------------------------------------------------------
  findMissingArgument(predicate: string): string;
  findBadType(value: string): string;
  findUnknownPredicate(arg: string): string;

  // --- font ----------------------------------------------------------------
  fontCurrent(size: number, fallback: number, min: number, max: number): string;
  fontNotASize(value: string): string;
  fontRange(min: number, max: number): string;

  // --- lang ----------------------------------------------------------------
  langCurrent(lang: string, available: string): string;
  langNoSuch(target: string, available: string): string;

  // --- crt, matrix ---------------------------------------------------------
  crtState(on: boolean): string;
  matrixPiped: string;

  // --- doom ----------------------------------------------------------------
  doomNeedsKeyboard: string;
  doomLoading: string;
  doomFontRange(min: number, max: number): string;
  doomUnknownOption(arg: string): string;
  doomFailed(error: string): string;
  doomResult(frames: number, seconds: string, fps: string, cols: number, rows: number, worst: string): string;
  /** O HUD do `doom --fps`, escrito sobre a última linha enquanto o jogo roda. */
  doomHud(fps: string, cols: number, rows: number, tick: string, worst: string, frame: string): string;

  // --- sudo, rm ------------------------------------------------------------
  sudoNotFound(name: string): string;
  rmMissingOperand: string;
  rmDangerous: string;
  rmCannotRemove(path: string, reason: string): string;
  rmReasons: { permission: string; notPermitted: string; missing: string; isDir: string };
  rmRemoved(path: string, isDir: boolean): string;
  recoveryText: string[];

  // --- reboot, top, pipes --------------------------------------------------
  rebootPiped: string;
  topPiped: string;

  // --- free, df, ps --------------------------------------------------------
  freeHeader: string[];
  freeRows: { mem: string; swap: string };
  dfHeader(human: boolean): string[];
  psHeader: string[];

  // --- top -----------------------------------------------------------------
  topFirstLine(time: string, up: string, load: string): string;
  topTasks(total: number, running: number): string;
  topCpu(usage: string, temp: string | null): string;
  topMem(total: string, free: string, used: string, cache: string): string;
  topSwap(total: string, free: string, used: string, available: string): string;
  topColumns: string[];
  topQuit(synthetic: boolean): string;

  // --- uptime, neofetch ----------------------------------------------------
  uptimeLine(time: string, up: string, load: string): string;
  neofetch: {
    host: string;
    kernel: string;
    uptime: string;
    shell: string;
    shellValue: string;
    terminal: string;
    cpu: string;
    load: string;
    temp: string;
    memory: string;
    disk: string;
    synthetic: string;
  };

  // --- stats ---------------------------------------------------------------
  statsEmpty: string;
  statsTotal(count: string, since: string, countries: number): string;
  statsBeginning: string;
  statsMissing: string;
  statsPrivacy: string;

  // --- boot ----------------------------------------------------------------
  bootOffline: string[];
  bootLabels: { host: string; kernel: string; uptime: string; cpu: string; memory: string; disk: string; note: string };
  bootSynthetic: string;
  bootWelcome: string;
  bootHelpHint: string;

  /** As dicas dos chips da barra do celular, que viram o `title` do botão. */
  chips: {
    ls: string;
    cdUp: string;
    cat: string;
    tab: string;
    previous: string;
    help: string;
    cancel: string;
  };

  // --- datas e durações ----------------------------------------------------
  months: string[];
  weekdays: string[];
  /** `4 days` / `4 dias`. O `uptime` e o `neofetch` pedem plural correto. */
  days(n: number): string;
  hours(n: number): string;
  minutes(n: number): string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const en: Messages = {
  locale: 'en-US',
  decimal: '.',

  commandNotFound: (name) => `bash: ${name}: command not found\n`,
  tryHelp: "try 'help' for the list of commands\n",
  redirectIsDir: (target) => `bash: ${target}: Is a directory\n`,
  syntaxNear: (token) => `bash: syntax error near unexpected token \`${token}'`,
  syntaxUnexpectedEnd: 'bash: syntax error: unexpected end of input',
  syntaxUnmatched: (quote) => `bash: unexpected EOF while looking for matching \`${quote}'`,

  noSuchFile: (cmd, target) => `${cmd}: ${target}: No such file or directory\n`,
  isDirectory: (cmd, target) => `${cmd}: ${target}: Is a directory\n`,
  notDirectory: (cmd, target) => `${cmd}: ${target}: Not a directory\n`,
  cannotAccess: (cmd, target) => `${cmd}: cannot access '${target}': No such file or directory\n`,
  invalidOption: (cmd, flag) => `${cmd}: invalid option -- '${flag}'\n`,
  usageLine: (text) => `usage: ${text}\n`,
  offline: (cmd) => `${cmd}: cannot reach the machine\n`,

  lsTotal: (count) => `total ${count}`,
  treeCount: (dirs, files) =>
    `${dirs} ${dirs === 1 ? 'directory' : 'directories'}, ${files} ${files === 1 ? 'file' : 'files'}`,

  helpHeader: (all) => (all ? 'every command on this machine:' : 'the essentials:'),
  helpFooter: (all) =>
    all
      ? "\n'man <command>' explains any of them in detail."
      : "\n'help --all' lists everything, 'man <command>' explains one in detail.",
  manWhich: 'What manual page do you want?\n',
  manNoEntry: (name) => `No manual entry for ${name}\n`,
  manSections: { name: 'NAME', usage: 'USAGE', description: 'DESCRIPTION' },

  grepBadRegex: (pattern) => `grep: ${pattern}: invalid regular expression\n`,
  badLineCount: 'invalid number of lines\n',
  wcTotal: 'total',

  findMissingArgument: (predicate) => `find: missing argument to '${predicate}'\n`,
  findBadType: (value) => `find: unknown argument to -type: ${value}\n`,
  findUnknownPredicate: (arg) => `find: unknown predicate '${arg}'\n`,

  fontCurrent: (size, fallback, min, max) => `${size}px (default ${fallback}, ${min}-${max})\n`,
  fontNotASize: (value) => `font: not a size: ${value}\n`,
  fontRange: (min, max) => `font: size must be between ${min} and ${max}\n`,

  langCurrent: (lang, available) => `${lang} (available: ${available})\n`,
  langNoSuch: (target, available) => `lang: no such language: ${target}\navailable: ${available}\n`,

  crtState: (on) => (on ? 'crt: on\n' : 'crt: off\n'),
  matrixPiped: 'matrix: this one has to be watched, not piped\n',

  doomNeedsKeyboard:
    'doom: needs a keyboard: arrows, ctrl and space at the same time.\n' +
    'Come back from a desktop and it will be here.\n',
  doomLoading: 'loading DOOM (about 4MB, once)...\n',
  doomFontRange: (min, max) => `doom: --font must be between ${min} and ${max}\n`,
  doomUnknownOption: (arg) => `doom: unknown option ${arg}\n`,
  doomFailed: (error) => `doom: failed to start (${error})\n`,
  doomResult: (frames, seconds, fps, cols, rows, worst) =>
    `DOOM: ${frames} frames in ${seconds}s (${fps} fps) at ${cols}x${rows}, worst tick ${worst}ms\n`,
  doomHud: (fps, cols, rows, tick, worst, frame) =>
    `${fps} fps  ${cols}x${rows}  tick ${tick}ms  worst ${worst}ms  frame ${frame}KB`,

  sudoNotFound: (name) => `sudo: ${name}: command not found\n`,
  rmMissingOperand: 'rm: missing operand\n',
  rmDangerous:
    "rm: it is dangerous to operate recursively on '/'\n" +
    'rm: use --no-preserve-root to override this failsafe\n',
  rmCannotRemove: (path, reason) => `rm: cannot remove '${path}': ${reason}`,
  rmReasons: {
    permission: 'Permission denied',
    notPermitted: 'Operation not permitted',
    missing: 'No such file or directory',
    isDir: 'Is a directory',
  },
  rmRemoved: (path, isDir) => (isDir ? `removed directory '${path}'` : `removed '${path}'`),
  recoveryText: [
    'Congratulations. You did it. You actually did it.',
    '',
    'You ran rm as root against the root of the filesystem, on a stranger\'s',
    'machine, on a page you opened maybe ninety seconds ago, and it ran. You',
    'watched a career go past and disappear, one line at a time. The degree. The',
    'projects. The little file where he introduces himself to whoever drops by.',
    'All of it, because you wanted to know whether it would really let you.',
    '',
    'It let you.',
    '',
    'And here you are, standing in an empty machine, reading the one file that is',
    'left. Take a moment. Was it everything you hoped it would be?',
    '',
    'The Raspberry Pi, incidentally, heard nothing about any of this. It is on a',
    'desk in Brazil and it is perfectly fine. What you destroyed was a copy,',
    'handed to your browser at boot, yours and nobody else\'s. You have broken',
    'nothing but your own tab. That is either a relief or a disappointment, and',
    'only you know which.',
    '',
    'This file survived because it is immutable, and it is immutable because',
    'somebody, at some point, foresaw you.',
    '',
    '    reboot        puts it all back, as though you had never been here',
    '',
    'Go ahead. Nobody has to know.',
  ],

  rebootPiped: 'reboot: cannot write to a pipe\n',
  topPiped: 'top: cannot write to a pipe. Try `ps` instead\n',

  freeHeader: ['', 'total', 'used', 'free', 'shared', 'buff/cache', 'available'],
  freeRows: { mem: 'Mem:', swap: 'Swap:' },
  dfHeader: (human) => ['Filesystem', human ? 'Size' : '1K-blocks', 'Used', 'Avail', 'Use%', 'Mounted on'],
  psHeader: ['USER', 'PID', '%CPU', '%MEM', 'RSS', 'S', 'TIME', 'COMMAND'],

  topFirstLine: (time, up, load) => `top - ${time} up ${up},  load average: ${load}`,
  topTasks: (total, running) => `Tasks: ${total} total, ${running} running`,
  topCpu: (usage, temp) => `%Cpu(s): ${usage} us${temp === null ? '' : `,  temp ${temp}C`}`,
  topMem: (total, free, used, cache) =>
    `MiB Mem : ${total} total, ${free} free, ${used} used, ${cache} buff/cache`,
  topSwap: (total, free, used, available) =>
    `MiB Swap: ${total} total, ${free} free, ${used} used. ${available} avail Mem`,
  topColumns: ['PID', 'USER', '%CPU', '%MEM', 'RES', 'S', 'TIME+', 'COMMAND'],
  topQuit: (synthetic) => (synthetic ? 'synthetic data, press q to quit' : 'press q to quit'),

  uptimeLine: (time, up, load) => ` ${time} up ${up},  load average: ${load}\n`,
  neofetch: {
    host: 'Host',
    kernel: 'Kernel',
    uptime: 'Uptime',
    shell: 'Shell',
    shellValue: 'this one, written by hand',
    terminal: 'Terminal',
    cpu: 'CPU',
    load: 'Load',
    temp: 'Temp',
    memory: 'Memory',
    disk: 'Disk (/)',
    synthetic: 'NOTE: synthetic data. This is not the Pi.',
  },

  statsEmpty: 'Nothing recorded yet. You are early.',
  statsTotal: (count, since, countries) =>
    `${count} commands typed here since ${since}` + (countries > 1 ? `, from ${countries} countries` : ''),
  statsBeginning: 'the beginning',
  statsMissing: 'not commands here, but people tried:',
  statsPrivacy:
    'Nobody is identified: no IP, no cookie, no session. Only the first word ' +
    'of each line, and the country. `cat /etc/privacy` for the whole of it.',

  bootOffline: [
    '  host        the machine is not answering right now',
    '  status      serving this page from cache, or from a very patient nginx',
  ],
  bootLabels: {
    host: 'host',
    kernel: 'kernel',
    uptime: 'uptime',
    cpu: 'cpu',
    memory: 'memory',
    disk: 'disk',
    note: 'NOTE',
  },
  bootSynthetic: 'synthetic data. This is not the Pi',
  bootWelcome: 'This is a portfolio with no interface. It has a shell instead.',
  bootHelpHint: "Type 'help' for the handful of commands, or 'ls' to just look around.",

  chips: {
    ls: 'list this directory',
    cdUp: 'go up one directory',
    cat: 'read a file, pick it with Tab',
    tab: 'complete what is typed',
    previous: 'previous command',
    help: 'list the commands',
    cancel: 'abandon the line',
  },

  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  days: (n) => plural(n, 'day'),
  hours: (n) => plural(n, 'hour'),
  minutes: (n) => plural(n, 'min'),
};
