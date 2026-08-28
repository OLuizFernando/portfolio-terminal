/**
 * Camada 4: personalidade.
 *
 * A régua para entrar aqui é a densidade, não a quantidade — cada piada
 * mal-acabada enfraquece as boas. São seis, e todas se comportam como comando de
 * verdade: respeitam pipe, código de saída e `man`.
 */

import {
  fail,
  fromLines,
  ok,
  type CommandResult,
  type CommandSpec,
  type Invocation,
  type ShellContext,
} from './types';
import { docs, t } from '../i18n';
import { runMatrix } from '../terminal/matrix';
import { wrap } from '../system/format';
import { resolve } from '../fs/path';
import type { Vfs } from '../fs/vfs';

/** Onde o `fortune` procura as frases. Arquivo de verdade na árvore simulada. */
const FORTUNES = '/usr/share/fortunes';

const sudo: CommandSpec = {
  name: 'sudo',
  summary: 'execute a command as root',
  usage: 'sudo <command> [args...]',
  man:
    'Runs a command as root, and it really does run as root.\n\n' +
    'There is no password, because there is nothing here worth one. You are a\n' +
    'guest on a machine that is not yours, but everything this shell can reach\n' +
    'is a copy that was handed to your browser at boot. Break it and you break\n' +
    'your own tab — the Raspberry Pi never hears about it.\n\n' +
    'Most commands do not care whether you used sudo. Exactly one does, and it\n' +
    'is not in any list.',
  run({ argv, stdin, piped, ctx }: Invocation) {
    if (argv.length < 2) return fail(t().usageLine(docs(sudo).usage), 2);

    const name = argv[1]!;
    const spec = ctx.registry.get(name);
    if (!spec) return fail(t().sudoNotFound(name));

    // O sudo não interpreta nada do que vem depois: ele levanta o privilégio e
    // entrega o resto do argv inteiro, com til e glob já expandidos pelo
    // executor. Comando que não olha para `sudo` roda igual com e sem ele.
    return spec.run({ argv: argv.slice(1), stdin, piped, sudo: true, ctx });
  },
};

/** O arquivo que sobrevive ao apagamento, porque é o caminho de volta dele. */
const RECOVERY = '/RECOVERY.txt';

/** Lido na hora do apagamento: o sobrevivente fala o idioma de quem apagou. */
const recoveryText = () => fromLines(t().recoveryText);

/**
 * O único caminho que o `rm` não leva, e o motivo que o `rm` de verdade daria.
 *
 * O RECOVERY.txt é imutável porque precisa ser: sem ele o apagamento não teria
 * saída que não fosse recarregar a página.
 */
function immovable(path: string): string | null {
  return path === RECOVERY ? t().rmReasons.notPermitted : null;
}

/** Os caminhos na ordem em que o `rm -r` os visita: os filhos antes do pai. */
function depthFirst(vfs: Vfs, path: string): string[] {
  const out: string[] = [];
  for (const { name } of vfs.list(path, true)) {
    out.push(...depthFirst(vfs, path === '/' ? `/${name}` : `${path}/${name}`));
  }
  out.push(path);
  return out;
}

/**
 * A cadência do apagamento: começa legível e acelera.
 *
 * As primeiras linhas precisam ser lidas — é ali que o visitante reconhece o
 * próprio `about.txt` sendo comido. Depois disso ler linha por linha não
 * acrescenta nada, e o que comunica é o borrão. Um intervalo fixo erra os dois
 * lados: lento vira espera, rápido nunca deixa reconhecer nada.
 */
const FIRST_MS = 150;
const LAST_MS = 18;
const DECAY = 0.9;

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * O apagamento, de verdade.
 *
 * Nenhum caminho aqui é inventado: a varredura é da árvore que está montada, na
 * ordem em que o `rm -r` a visitaria, e o que é dito removido some mesmo. O
 * visitante termina num sistema morto — `ls` não devolve nada, `cat` não acha
 * nada — e o shell continua de pé porque nunca esteve no disco. É o que
 * acontece numa máquina de verdade, menos a parte de ela voltar.
 *
 * O `rm` sem `-v` seria silencioso, e silêncio aqui não passa a impressão de
 * nada acontecendo: passa a de nada ter acontecido. Então ele fala, no formato
 * exato do `-v`, sobre arquivos que existem de verdade.
 */
async function wipe(
  ctx: ShellContext,
  targets: string[],
  announce: boolean,
  piped: boolean,
): Promise<CommandResult> {
  const removed: string[] = [];
  let pause = FIRST_MS;

  // Na tela a cadência é o ponto; no pipe ela seria só atraso (armadilha 6).
  const say = async (line: string) => {
    if (piped) {
      removed.push(line);
      return;
    }
    ctx.term.write(line + '\n');
    await sleep(pause);
    pause = Math.max(LAST_MS, Math.round(pause * DECAY));
  };

  for (const target of targets) {
    // A lista sai inteira antes da primeira remoção: apagar durante a varredura
    // arrancaria o galho em que ela está sentada.
    for (const path of depthFirst(ctx.vfs, target)) {
      // Um segundo apagamento encontra o sobrevivente do primeiro. Dizer que o
      // removeu e recusar removê-lo três linhas depois seriam as duas coisas
      // ao mesmo tempo; a recusa do fim é a única resposta certa.
      if (immovable(path)) continue;

      const directory = ctx.vfs.isDir(path);
      ctx.vfs.remove(path);
      await say(t().rmRemoved(path, directory));
    }
  }

  // O sobrevivente é escrito no fim, e não no começo, para que a recusa de
  // removê-lo seja a última linha da tela: ela é a única pista do caminho de
  // volta, e no meio de setenta linhas de remoção ninguém a leria. É a única
  // liberdade que este comando toma, e ela é sobre *quando* o arquivo nasce —
  // não sobre o que é dito dele, que é verdade: ele existe e não sai.
  ctx.vfs.writeFile(RECOVERY, recoveryText(), false, true);

  // Pelo `/*` o `rm` nunca recebeu este caminho, e não fala do que não lhe
  // deram. Quem entrou por ali acha o sobrevivente com um `ls /`.
  if (!announce) return piped ? ok(fromLines(removed)) : ok();

  const denial = t().rmCannotRemove(RECOVERY, t().rmReasons.notPermitted);
  if (piped) return { stdout: fromLines(removed), stderr: denial + '\n', code: 1 };

  ctx.term.write(denial + '\n');
  return fail('', 1);
}

/**
 * O `rm`. Fica fora de toda listagem: é reação a comando destrutivo, não
 * comando — a mesma regra que esconde o `~/.secret`.
 *
 * Ele apaga de verdade, e por isso é o único comando da máquina que pergunta se
 * veio pelo `sudo`. Sem privilégio, a resposta é a que o Unix daria a quem tenta
 * mexer numa árvore que é do root: `Permission denied` — o que o `ls -l` já
 * dizia, para quem tinha olhado.
 */
const rm: CommandSpec = {
  name: 'rm',
  summary: 'remove files and directories',
  usage: 'rm [-rf] <path>...',
  hidden: true,
  async run({ argv, ctx, piped, sudo: elevated }: Invocation) {
    const flags = argv.slice(1).filter((argument) => argument.startsWith('-'));
    const operands = argv.slice(1).filter((argument) => !argument.startsWith('-'));
    if (operands.length === 0) return fail(t().rmMissingOperand, 2);

    const recursive = flags.some((flag) => flag === '--recursive' || /^-[a-zA-Z]*[rR]/.test(flag));
    const force = flags.some((flag) => flag === '--force' || /^-[a-zA-Z]*f/.test(flag));
    const override = flags.includes('--no-preserve-root');

    const paths = operands.map((operand) => resolve(ctx.env.cwd, operand));
    const top = ctx.vfs.list('/', true).map(({ name }) => `/${name}`);

    // `rm -rf /` pede a trava; o coreutils de verdade também pede. `rm -rf /*`
    // não pede, porque o glob já entregou os filhos e nunca chega um `/` aqui —
    // é o buraco que existe no rm de verdade, e existe aqui pelo mesmo motivo.
    const wholeRoot = paths.includes('/') || operands.includes('/*');
    const total = top.length > 0 && top.every((path) => paths.includes(path));

    if (recursive && wholeRoot && !override) {
      return fail(t().rmDangerous);
    }

    if (recursive && (wholeRoot || total)) {
      // A recusa sai da árvore que está montada: os caminhos são os que existem
      // de fato, não uma lista de /bin e /boot que esta máquina não tem.
      if (!elevated) {
        return fail(
          fromLines(top.map((path) => t().rmCannotRemove(path, t().rmReasons.permission))),
          1,
        );
      }

      // Com `/` o comando recebeu a raiz e o RECOVERY.txt está dentro dela; com
      // `/*` o glob fechou a lista antes de o arquivo existir, e o `rm` não fala
      // de caminho que não lhe deram. É o que o `announce` decide.
      const doomed = wholeRoot ? ctx.vfs.list('/', true).map(({ name }) => `/${name}`) : paths;
      return wipe(ctx, doomed, wholeRoot, piped);
    }

    const errors: string[] = [];
    for (const [index, path] of paths.entries()) {
      // O erro nomeia o caminho como o visitante escreveu, não o resolvido.
      const shown = operands[index]!;
      const node = ctx.vfs.lookup(path);

      if (!node) {
        if (!force) errors.push(t().rmCannotRemove(shown, t().rmReasons.missing));
        continue;
      }
      if (node.kind === 'dir' && !recursive) {
        errors.push(t().rmCannotRemove(shown, t().rmReasons.isDir));
        continue;
      }

      const stuck = immovable(path);
      if (stuck) {
        errors.push(t().rmCannotRemove(shown, stuck));
        continue;
      }
      if (!elevated) {
        errors.push(t().rmCannotRemove(shown, t().rmReasons.permission));
        continue;
      }

      ctx.vfs.remove(path);
    }

    return errors.length === 0 ? ok() : fail(fromLines(errors), 1);
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
    if (raw === null) return fail(t().noSuchFile('fortune', FORTUNES));

    const quotes = raw
      .split(/^%$/m)
      .map((quote) => quote.replace(/^\n+|\n+$/g, ''))
      .filter((quote) => quote !== '');

    if (quotes.length === 0) return fail(t().fortuneEmpty);
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
    if (text.trim() === '') return fail(t().usageLine(docs(cowsay).usage), 2);
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
    if (piped) return fail(t().matrixPiped);
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
      return fail(t().usageLine(docs(crt).usage), 2);
    }

    const on = argument === undefined ? !ctx.env.crt : argument === 'on';
    if (on !== ctx.env.crt) {
      ctx.env.crt = on;
      ctx.term.setCrt(on);
      ctx.savePrefs();
    }

    return ok(t().crtState(on));
  },
};

export const funCommands: CommandSpec[] = [sudo, rm, fortune, cowsay, matrix, crt];
