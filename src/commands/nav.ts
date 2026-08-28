import { basename, contract, dirname, expand, resolve } from '../fs/path';
import { isProcPath, readProc } from '../system/proc';
import { parseFlags } from './flags';
import { columns, formatDate, modeOf, sizeOf } from './format';
import { docs, t } from '../i18n';
import { fail, fromLines, ok, toLines, type CommandSpec, type Invocation } from './types';

const decorate = (name: string, isDir: boolean) => (isDir ? `${name}/` : name);

const ls: CommandSpec = {
  name: 'ls',
  summary: 'list directory contents',
  usage: 'ls [-a] [-l] [path...]',
  man: 'Lists files and directories.\n\n  -a  include entries starting with a dot\n  -l  long format: permissions, size, modification date\n\nDirectories are printed with a trailing slash.\nModification dates are real: they come from the last git commit that\ntouched each file.',
  primary: true,
  run({ argv, piped, ctx }: Invocation) {
    const { flags, operands, error } = parseFlags(argv, 'al', 'ls');
    if (error) return fail(error, 2);

    const all = flags.has('a');
    const long = flags.has('l');
    const targets = operands.length > 0 ? operands : ['.'];

    const chunks: string[] = [];
    let stderr = '';
    let code = 0;

    const renderDir = (path: string) => {
      const entries = ctx.vfs.list(path, all);
      const listing = all
        ? [{ name: '.', node: ctx.vfs.lookup(path)! }, { name: '..', node: ctx.vfs.lookup(dirname(path))! }, ...entries]
        : entries;

      // Numa pipe, uma entrada por linha e sem barra — assim `ls | grep projects`
      // e `ls | wc -l` se comportam como o visitante espera.
      if (piped) return fromLines(listing.map((e) => e.name));

      if (!long) {
        return columns(listing.map((e) => decorate(e.name, e.node.kind === 'dir')), ctx.term.cols);
      }

      const sizes = listing.map((e) => String(sizeOf(e.node)));
      const sizeWidth = Math.max(0, ...sizes.map((s) => s.length));
      const lines = listing.map(
        (entry, i) =>
          // Dono e grupo são o root, e não o visitante: é o que explica o
          // `Permission denied` do `rm` sem precisar de nota de rodapé.
          `${modeOf(entry.node)} 1 root root ${sizes[i]!.padStart(sizeWidth)} ` +
          `${formatDate(entry.node.mtime)} ${decorate(entry.name, entry.node.kind === 'dir')}`,
      );
      return `${t().lsTotal(listing.length)}\n${fromLines(lines)}`;
    };

    for (const target of targets) {
      const path = resolve(ctx.env.cwd, expand(target, ctx.env.home));
      const node = ctx.vfs.lookup(path);

      if (!node) {
        stderr += t().cannotAccess('ls', target);
        code = 2;
        continue;
      }

      const header = targets.length > 1 ? `${target}:\n` : '';

      if (node.kind === 'file') {
        chunks.push(long
          ? `${modeOf(node)} 1 root root ${sizeOf(node)} ${formatDate(node.mtime)} ${target}\n`
          : `${target}\n`);
      } else {
        chunks.push(header + renderDir(path));
      }
    }

    return { stdout: chunks.join(targets.length > 1 ? '\n' : ''), stderr, code };
  },
};

const cd: CommandSpec = {
  name: 'cd',
  summary: 'change the current directory',
  usage: 'cd [path]',
  man: 'Changes the current directory.\n\n  cd        go home\n  cd -      go back to the previous directory\n  cd ..     go up one level',
  primary: true,
  run({ argv, ctx }: Invocation) {
    const raw = argv[1] ?? '~';
    const target = raw === '-' ? ctx.env.oldcwd : resolve(ctx.env.cwd, expand(raw, ctx.env.home));
    const node = ctx.vfs.lookup(target);

    if (!node) return fail(t().noSuchFile('cd', raw));
    if (node.kind !== 'dir') return fail(t().notDirectory('cd', raw));

    ctx.env.oldcwd = ctx.env.cwd;
    ctx.env.cwd = target;

    // `cd -` imprime o destino, como no bash.
    return ok(raw === '-' ? `${contract(target, ctx.env.home)}\n` : '');
  },
};

const pwd: CommandSpec = {
  name: 'pwd',
  summary: 'print the current directory',
  usage: 'pwd',
  run({ ctx }: Invocation) {
    return ok(`${ctx.env.cwd}\n`);
  },
};

const cat: CommandSpec = {
  name: 'cat',
  summary: 'print the contents of a file',
  usage: 'cat [file...]',
  man: 'Prints files to the output. With no arguments, echoes the input it\nreceives from a pipe.',
  primary: true,
  async run({ argv, stdin, ctx }: Invocation) {
    if (argv.length === 1) return ok(stdin);

    let stdout = '';
    let stderr = '';
    let code = 0;

    for (const target of argv.slice(1)) {
      const path = resolve(ctx.env.cwd, expand(target, ctx.env.home));
      const node = ctx.vfs.lookup(path);

      if (!node) {
        stderr += t().noSuchFile('cat', target);
        code = 1;
      } else if (node.kind === 'dir') {
        stderr += t().isDirectory('cat', target);
        code = 1;
      } else if (isProcPath(path)) {
        // Os arquivos de /proc existem na árvore vazios: o conteúdo é lido da
        // máquina de verdade na hora, como faria um /proc de verdade.
        try {
          stdout += await readProc(basename(path));
        } catch {
          stderr += t().offline('cat');
          code = 1;
        }
      } else {
        stdout += node.content.endsWith('\n') || node.content === '' ? node.content : node.content + '\n';
      }
    }

    return { stdout, stderr, code };
  },
};

const tree: CommandSpec = {
  name: 'tree',
  summary: 'show the directory structure',
  usage: 'tree [-a] [path]',
  run({ argv, ctx }: Invocation) {
    const { flags, operands, error } = parseFlags(argv, 'a', 'tree');
    if (error) return fail(error, 2);

    const raw = operands[0] ?? '.';
    const root = resolve(ctx.env.cwd, expand(raw, ctx.env.home));
    const node = ctx.vfs.lookup(root);

    if (!node) return fail(t().noSuchFile('tree', raw));
    if (node.kind === 'file') return ok(`${raw}\n\n${t().treeCount(0, 1)}\n`);

    let dirs = 0;
    let files = 0;
    const lines = [contract(root, ctx.env.home)];

    const walk = (path: string, prefix: string) => {
      const entries = ctx.vfs.list(path, flags.has('a'));
      entries.forEach((entry, index) => {
        const last = index === entries.length - 1;
        const isDir = entry.node.kind === 'dir';
        if (isDir) dirs++;
        else files++;
        lines.push(`${prefix}${last ? '└── ' : '├── '}${decorate(entry.name, isDir)}`);
        if (isDir) walk(`${path}/${entry.name}`, `${prefix}${last ? '    ' : '│   '}`);
      });
    };

    walk(root, '');
    lines.push('', t().treeCount(dirs, files));
    return ok(fromLines(lines));
  },
};

const clear: CommandSpec = {
  name: 'clear',
  summary: 'clear the screen',
  usage: 'clear',
  run({ ctx }: Invocation) {
    ctx.term.clear();
    return ok();
  },
};

const help: CommandSpec = {
  name: 'help',
  summary: 'show the available commands',
  usage: 'help [--all]',
  man: 'With no arguments, shows the handful of commands you need to get around.\n`help --all` lists every command that exists.',
  primary: true,
  run({ argv, ctx }: Invocation) {
    const all = argv.includes('--all');
    const specs = [...ctx.registry.values()].filter((spec) => !spec.hidden && (all || spec.primary));
    const width = Math.max(...specs.map((spec) => spec.name.length));
    const lines = specs
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((spec) => `  \x1b[1m${spec.name.padEnd(width)}\x1b[0m  ${docs(spec).summary}`);

    return ok(`${t().helpHeader(all)}\n${fromLines(lines)}${t().helpFooter(all)}\n`);
  },
};

const man: CommandSpec = {
  name: 'man',
  summary: 'show the manual for a command',
  usage: 'man <command>',
  run({ argv, ctx }: Invocation) {
    const name = argv[1];
    if (!name) return fail(t().manWhich);

    const spec = ctx.registry.get(name);
    if (!spec || spec.hidden) return fail(t().manNoEntry(name));

    const page = docs(spec);
    const section = t().manSections;
    const body = page.man ?? page.summary.charAt(0).toUpperCase() + page.summary.slice(1) + '.';
    return ok(`\x1b[1m${section.name}\x1b[0m\n  ${spec.name} — ${page.summary}\n\n\x1b[1m${section.usage}\x1b[0m\n  ${page.usage}\n\n\x1b[1m${section.description}\x1b[0m\n${body
      .split('\n')
      .map((line) => (line ? `  ${line}` : ''))
      .join('\n')}\n`);
  },
};

const history: CommandSpec = {
  name: 'history',
  summary: 'show the commands you have typed',
  usage: 'history',
  man: 'Your history lives in this browser only and survives a reload.\nIt is also readable at ~/.bash_history.',
  run({ ctx }: Invocation) {
    const width = String(ctx.env.history.length).length;
    return ok(fromLines(ctx.env.history.map((entry, i) => `  ${String(i + 1).padStart(width)}  ${entry}`)));
  },
};

const exit: CommandSpec = {
  name: 'exit',
  summary: 'close the session',
  usage: 'exit',
  run({ ctx }: Invocation) {
    ctx.term.exit();
    return ok();
  },
};

/**
 * O `reboot`.
 *
 * Não pede privilégio nenhum de propósito: ele é o caminho de volta do
 * `rm -rf /`, e trancar a saída atrás de um segundo enigma cobra do visitante
 * sem devolver piada nenhuma. Nada aqui precisa ser protegido de um reinício —
 * a máquina que ele reinicia é uma cópia, e é só dele.
 */
const reboot: CommandSpec = {
  name: 'reboot',
  summary: 'restart the machine',
  usage: 'reboot',
  man:
    'Remounts the filesystem from scratch and runs the boot sequence again.\n\n' +
    'Everything you wrote with `>` is lost, everything you deleted comes back,\n' +
    'and you land at the prompt in your home directory.\n\n' +
    'Your history, your font size and your language survive it: those live in\n' +
    'the browser, not in the machine. Reloading the page does the same thing,\n' +
    'and takes longer.',
  async run({ ctx, piped }: Invocation) {
    // Reiniciar limpa a tela e redesenha o boot. Num pipe não há tela.
    if (piped) return fail(t().rebootPiped, 2);
    await ctx.reboot();
    return ok();
  },
};

const whichName = (path: string) => basename(path);

const find: CommandSpec = {
  name: 'find',
  summary: 'search for files by name',
  usage: 'find [path] [-name <pattern>] [-type f|d]',
  man: 'Walks a directory tree and prints what it finds.\n\n  -name <pattern>  match the file name (accepts * and ?)\n  -type f          files only\n  -type d          directories only',
  run({ argv, ctx }: Invocation) {
    const operands: string[] = [];
    let namePattern: RegExp | null = null;
    let type: 'f' | 'd' | null = null;

    for (let i = 1; i < argv.length; i++) {
      const arg = argv[i]!;
      if (arg === '-name') {
        const pattern = argv[++i];
        if (!pattern) return fail(t().findMissingArgument('-name'), 2);
        namePattern = new RegExp(
          '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
        );
      } else if (arg === '-type') {
        const value = argv[++i];
        if (value !== 'f' && value !== 'd') return fail(t().findBadType(value ?? ''), 2);
        type = value;
      } else if (arg.startsWith('-')) {
        return fail(t().findUnknownPredicate(arg), 2);
      } else {
        operands.push(arg);
      }
    }

    const raw = operands[0] ?? '.';
    const root = resolve(ctx.env.cwd, expand(raw, ctx.env.home));
    if (!ctx.vfs.exists(root)) return fail(t().noSuchFile('find', `'${raw}'`));

    const results = ctx.vfs.walk(root).filter((path) => {
      const node = ctx.vfs.lookup(path)!;
      if (type === 'f' && node.kind !== 'file') return false;
      if (type === 'd' && node.kind !== 'dir') return false;
      if (namePattern && !namePattern.test(whichName(path))) return false;
      return true;
    });

    // Reapresenta relativo quando a busca começou relativa, como o find faz.
    const prefix = ctx.env.cwd === '/' ? '/' : ctx.env.cwd + '/';
    const display = raw.startsWith('/') || raw.startsWith('~')
      ? results
      : results.map((p) => (p === ctx.env.cwd ? raw : p.startsWith(prefix) ? `${raw === '.' ? './' : raw + '/'}${p.slice(prefix.length)}` : p));

    return ok(fromLines(display));
  },
};

export const navCommands: CommandSpec[] = [ls, cd, pwd, cat, tree, find, clear, help, man, history, reboot, exit];
export { toLines };
