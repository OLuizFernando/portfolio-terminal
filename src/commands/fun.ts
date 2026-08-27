/**
 * Camada 4: personalidade.
 *
 * A régua para entrar aqui é a densidade, não a quantidade — cada piada
 * mal-acabada enfraquece as boas. São seis, e todas se comportam como comando de
 * verdade: respeitam pipe, código de saída e `man`.
 */

import { fail, fromLines, ok, type CommandSpec, type Invocation } from './types';
import { runMatrix } from '../terminal/matrix';
import { wrap } from '../system/format';

/** Onde o `fortune` procura as frases. Arquivo de verdade na árvore simulada. */
const FORTUNES = '/usr/share/fortunes';

const sudo: CommandSpec = {
  name: 'sudo',
  summary: 'execute a command as another user',
  usage: 'sudo <command>',
  man:
    'Runs a command as another user.\n\n' +
    'You are guest, on a machine that is not yours, reached over the internet.\n' +
    'Guess how this goes.',
  run({ argv }: Invocation) {
    if (argv.length < 2) return fail('usage: sudo <command>\n', 2);
    // A mensagem é a do sudo de verdade, dois espaços entre as frases inclusive.
    return fail(
      'sudo: guest is not in the sudoers file.  This incident will be reported.\n',
    );
  },
};

/**
 * O `rm`. Fica fora de toda listagem: é reação a comando destrutivo, não
 * comando — a mesma regra que esconde o `~/.secret`.
 *
 * A recusa do `-rf /` não é invenção: o coreutils de verdade se recusa e manda
 * usar `--no-preserve-root`. Quem conhece a flag ganha a piada inteira; quem não
 * conhece leva a mesma resposta que levaria numa máquina de verdade.
 */
const rm: CommandSpec = {
  name: 'rm',
  summary: 'remove files',
  usage: 'rm [-rf] <path>',
  hidden: true,
  async run({ argv, ctx, piped }: Invocation) {
    const operands = argv.slice(1).filter((argument) => !argument.startsWith('-'));
    const flags = argv.slice(1).filter((argument) => argument.startsWith('-'));
    const override = flags.includes('--no-preserve-root');
    const root = operands.some((operand) => operand === '/' || operand === '/*');

    if (operands.length === 0) return fail('rm: missing operand\n', 2);

    if (root && !override) {
      return fail(
        "rm: it is dangerous to operate recursively on '/'\n" +
          'rm: use --no-preserve-root to override this failsafe\n',
      );
    }

    if (!root) {
      // EPERM, que é o que se leva ao tentar apagar arquivo imutável — e todo
      // arquivo daqui é, porque nenhum deles existe.
      return fail(`rm: cannot remove '${operands[0]}': Operation not permitted\n`, 1);
    }

    const doomed = ['/bin', '/boot', '/dev', '/etc', '/home', '/lib', '/proc', '/root', '/usr', '/var'];
    const lines = doomed.map((path) => `rm: removing '${path}'`);
    const punchline = [
      '',
      '...',
      '',
      'Just kidding. Nothing here was ever on a disk.',
      'Reload the page and it all comes back, exactly like this.',
      '',
    ];

    // No pipe a piada vira texto: `rm -rf --no-preserve-root / | wc -l` conta
    // linhas, não espera meio segundo por cada uma.
    if (piped) return ok(fromLines([...lines, ...punchline]));

    for (const line of lines) {
      ctx.term.write(line + '\n');
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    return ok(fromLines(punchline));
  },
};

const fortune: CommandSpec = {
  name: 'fortune',
  summary: 'print a random aphorism',
  usage: 'fortune',
  man:
    'Prints one of the epigrams in ' + FORTUNES + ', at random.\n\n' +
    'It is a real file. `cat` it and you get the whole collection, separated by\n' +
    '% on a line of its own, which is the format fortune has used since 1979.\n\n' +
    'Pipe it into `cowsay`.',
  run({ ctx }: Invocation) {
    const raw = ctx.vfs.readFile(FORTUNES);
    if (raw === null) return fail(`fortune: ${FORTUNES}: No such file or directory\n`);

    const quotes = raw
      .split(/^%$/m)
      .map((quote) => quote.replace(/^\n+|\n+$/g, ''))
      .filter((quote) => quote !== '');

    if (quotes.length === 0) return fail('fortune: no fortunes found\n');
    return ok(quotes[Math.floor(Math.random() * quotes.length)] + '\n');
  },
};

/** Largura do balão antes de quebrar a linha, como no cowsay original. */
const BUBBLE = 40;

export function bubble(text: string): string[] {
  const lines = wrap(text, BUBBLE);
  const width = Math.max(...lines.map((line) => line.length));

  if (lines.length === 1) {
    return [` ${'_'.repeat(width + 2)}`, `< ${lines[0]} >`, ` ${'-'.repeat(width + 2)}`];
  }

  // Balão de várias linhas: barra vertical nas pontas e barra inclinada no meio,
  // que é o desenho que o cowsay usa para dizer "isto continua".
  return [
    ` ${'_'.repeat(width + 2)}`,
    ...lines.map((line, index) => {
      const left = index === 0 ? '/' : index === lines.length - 1 ? '\\' : '|';
      const right = index === 0 ? '\\' : index === lines.length - 1 ? '/' : '|';
      return `${left} ${line.padEnd(width)} ${right}`;
    }),
    ` ${'-'.repeat(width + 2)}`,
  ];
}

const COW = [
  '        \\   ^__^',
  '         \\  (oo)\\_______',
  '            (__)\\       )\\/\\',
  '                ||----w |',
  '                ||     ||',
];

const cowsay: CommandSpec = {
  name: 'cowsay',
  summary: 'a cow says what you say',
  usage: 'cowsay [text]',
  man:
    'A cow says it.\n\n' +
    'With arguments, it says those. Without, it says whatever it is fed:\n\n' +
    '  fortune | cowsay\n' +
    '  cat about.txt | cowsay\n\n' +
    'The bubble wraps at 40 columns, like the original does.',
  run({ argv, stdin }: Invocation) {
    const text = argv.length > 1 ? argv.slice(1).join(' ') : stdin.replace(/\n$/, '');
    if (text.trim() === '') return fail('usage: cowsay [text]\n', 2);
    return ok(fromLines([...bubble(text), ...COW]));
  },
};

const matrix: CommandSpec = {
  name: 'matrix',
  summary: 'follow the white rabbit',
  usage: 'matrix',
  man:
    'Digital rain, in the terminal you are already in.\n\n' +
    'Any key stops it, ctrl+c included. Like `doom` and `top`, it runs in the\n' +
    'alternate screen: when it ends, your shell is exactly where you left it.',
  async run({ ctx, piped }: Invocation) {
    if (piped) return fail('matrix: this one has to be watched, not piped\n');
    await runMatrix(ctx);
    return ok();
  },
};

const crt: CommandSpec = {
  name: 'crt',
  summary: 'scanlines and phosphor glow',
  usage: 'crt [on | off]',
  man:
    'Turns the terminal into the monitor this whole thing is pretending to be:\n' +
    'scanlines, the soft bleed of phosphor, and the darkened corners of a tube.\n\n' +
    '  crt        toggle\n' +
    '  crt on     force on\n' +
    '  crt off    force off\n\n' +
    'It is remembered in this browser, like the font size. It costs nothing to\n' +
    'the machine on the other side — the effect is entirely on your screen.',
  run({ argv, ctx }: Invocation) {
    const argument = argv[1];
    if (argv.length > 2 || (argument !== undefined && argument !== 'on' && argument !== 'off')) {
      return fail(`usage: ${crt.usage}\n`, 2);
    }

    const on = argument === undefined ? !ctx.env.crt : argument === 'on';
    if (on !== ctx.env.crt) {
      ctx.env.crt = on;
      ctx.term.setCrt(on);
      ctx.savePrefs();
    }

    return ok(on ? 'crt: on\n' : 'crt: off\n');
  },
};

export const funCommands: CommandSpec[] = [sudo, rm, fortune, cowsay, matrix, crt];
