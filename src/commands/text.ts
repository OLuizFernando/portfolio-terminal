import { expand, resolve } from '../fs/path';
import { docs, t } from '../i18n';
import { fail, fromLines, ok, toLines, type CommandSpec, type Invocation, type ShellContext } from './types';

interface Source {
  label: string;
  text: string;
}

/**
 * Junta as fontes de entrada de uma ferramenta de texto: os arquivos passados
 * como argumento ou, na ausência deles, o stdin do pipe.
 */
function gather(
  command: string,
  files: string[],
  stdin: string,
  ctx: ShellContext,
): { sources: Source[]; stderr: string; code: number } {
  if (files.length === 0) return { sources: [{ label: '-', text: stdin }], stderr: '', code: 0 };

  const sources: Source[] = [];
  let stderr = '';
  let code = 0;

  for (const file of files) {
    const path = resolve(ctx.env.cwd, expand(file, ctx.env.home));
    const node = ctx.vfs.lookup(path);
    if (!node) {
      stderr += t().noSuchFile(command, file);
      code = 1;
    } else if (node.kind === 'dir') {
      stderr += t().isDirectory(command, file);
      code = 1;
    } else {
      sources.push({ label: file, text: node.content });
    }
  }

  return { sources, stderr, code };
}

/** Lê `-n 5` ou a forma abreviada `-5`. */
function countArg(argv: string[], fallback: number): { count: number; files: string[]; error?: string } {
  const files: string[] = [];
  let count = fallback;

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '-n') {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value)) return { count, files, error: t().badLineCount };
      count = value;
    } else if (/^-\d+$/.test(arg)) {
      count = Number(arg.slice(1));
    } else {
      files.push(arg);
    }
  }

  return { count, files };
}

function shortFlags(argv: string[], known: string, command: string) {
  const flags = new Set<string>();
  const operands: string[] = [];

  for (const arg of argv.slice(1)) {
    if (arg.length > 1 && arg.startsWith('-') && !arg.startsWith('--')) {
      for (const flag of arg.slice(1)) {
        if (!known.includes(flag)) return { flags, operands, error: t().invalidOption(command, flag) };
        flags.add(flag);
      }
    } else {
      operands.push(arg);
    }
  }

  return { flags, operands, error: undefined as string | undefined };
}

const grep: CommandSpec = {
  name: 'grep',
  summary: 'filter lines matching a pattern',
  usage: 'grep [-i] [-v] [-n] [-c] <pattern> [file...]',
  man: 'Prints the lines that match a pattern. The pattern is a regular expression.\n\n  -i  ignore case\n  -v  invert: print lines that do NOT match\n  -n  prefix each line with its number\n  -c  print only how many lines matched\n\nWith no file, reads from a pipe:\n  cat projects/*/stack.txt | grep -i react',
  primary: true,
  run({ argv, stdin, ctx }: Invocation) {
    const { flags, operands, error } = shortFlags(argv, 'ivnc', 'grep');
    if (error) return fail(error, 2);

    const [pattern, ...files] = operands;
    if (pattern === undefined) return fail(t().usageLine(docs(grep).usage), 2);

    let re: RegExp;
    try {
      re = new RegExp(pattern, flags.has('i') ? 'i' : '');
    } catch {
      return fail(t().grepBadRegex(pattern), 2);
    }

    const { sources, stderr, code } = gather('grep', files, stdin, ctx);
    const prefixed = sources.length > 1;
    const out: string[] = [];
    let matched = false;

    for (const source of sources) {
      const hits: string[] = [];
      toLines(source.text).forEach((line, index) => {
        if (re.test(line) === !flags.has('v')) {
          hits.push(flags.has('n') ? `${index + 1}:${line}` : line);
        }
      });

      if (hits.length > 0) matched = true;
      const prefix = prefixed ? `${source.label}:` : '';
      if (flags.has('c')) out.push(`${prefix}${hits.length}`);
      else out.push(...hits.map((hit) => prefix + hit));
    }

    return { stdout: fromLines(out), stderr, code: code || (matched || flags.has('c') ? 0 : 1) };
  },
};

const echo: CommandSpec = {
  name: 'echo',
  summary: 'print text',
  usage: 'echo [-n] [text...]',
  run({ argv }: Invocation) {
    const noNewline = argv[1] === '-n';
    const words = argv.slice(noNewline ? 2 : 1);
    return ok(words.join(' ') + (noNewline ? '' : '\n'));
  },
};

const head: CommandSpec = {
  name: 'head',
  summary: 'print the first lines',
  usage: 'head [-n <count>] [file...]',
  run({ argv, stdin, ctx }: Invocation) {
    const { count, files, error } = countArg(argv, 10);
    if (error) return fail(`head: ${error}`, 2);

    const { sources, stderr, code } = gather('head', files, stdin, ctx);
    const chunks = sources.map((source) => {
      const body = fromLines(toLines(source.text).slice(0, count));
      return sources.length > 1 ? `==> ${source.label} <==\n${body}` : body;
    });

    return { stdout: chunks.join('\n'), stderr, code };
  },
};

const tail: CommandSpec = {
  name: 'tail',
  summary: 'print the last lines',
  usage: 'tail [-n <count>] [file...]',
  run({ argv, stdin, ctx }: Invocation) {
    const { count, files, error } = countArg(argv, 10);
    if (error) return fail(`tail: ${error}`, 2);

    const { sources, stderr, code } = gather('tail', files, stdin, ctx);
    const chunks = sources.map((source) => {
      const lines = toLines(source.text);
      const body = fromLines(count >= lines.length ? lines : lines.slice(lines.length - count));
      return sources.length > 1 ? `==> ${source.label} <==\n${body}` : body;
    });

    return { stdout: chunks.join('\n'), stderr, code };
  },
};

const wc: CommandSpec = {
  name: 'wc',
  summary: 'count lines, words and bytes',
  usage: 'wc [-l] [-w] [-c] [file...]',
  run({ argv, stdin, ctx }: Invocation) {
    const { flags, operands, error } = shortFlags(argv, 'lwc', 'wc');
    if (error) return fail(error, 2);

    const showAll = flags.size === 0;
    const { sources, stderr, code } = gather('wc', operands, stdin, ctx);
    const encoder = new TextEncoder();
    const totals = { l: 0, w: 0, c: 0 };

    const render = (text: string, label: string) => {
      const lines = toLines(text).length;
      const words = text.split(/\s+/).filter(Boolean).length;
      const bytes = encoder.encode(text).length;
      totals.l += lines;
      totals.w += words;
      totals.c += bytes;

      const parts: string[] = [];
      if (showAll || flags.has('l')) parts.push(String(lines).padStart(7));
      if (showAll || flags.has('w')) parts.push(String(words).padStart(7));
      if (showAll || flags.has('c')) parts.push(String(bytes).padStart(7));
      return parts.join(' ') + (label === '-' ? '' : ` ${label}`);
    };

    const out = sources.map((source) => render(source.text, source.label));

    if (sources.length > 1) {
      const parts: string[] = [];
      if (showAll || flags.has('l')) parts.push(String(totals.l).padStart(7));
      if (showAll || flags.has('w')) parts.push(String(totals.w).padStart(7));
      if (showAll || flags.has('c')) parts.push(String(totals.c).padStart(7));
      out.push(parts.join(' ') + ` ${t().wcTotal}`);
    }

    return { stdout: fromLines(out), stderr, code };
  },
};

const sort: CommandSpec = {
  name: 'sort',
  summary: 'sort lines',
  usage: 'sort [-r] [-n] [-u] [file...]',
  man: 'Sorts lines alphabetically.\n\n  -r  reverse\n  -n  compare as numbers\n  -u  drop duplicates',
  run({ argv, stdin, ctx }: Invocation) {
    const { flags, operands, error } = shortFlags(argv, 'rnu', 'sort');
    if (error) return fail(error, 2);

    const { sources, stderr, code } = gather('sort', operands, stdin, ctx);
    let lines = sources.flatMap((source) => toLines(source.text));

    lines.sort((a, b) =>
      flags.has('n') ? (parseFloat(a) || 0) - (parseFloat(b) || 0) : a.localeCompare(b),
    );
    if (flags.has('r')) lines.reverse();
    if (flags.has('u')) lines = lines.filter((line, i) => i === 0 || line !== lines[i - 1]);

    return { stdout: fromLines(lines), stderr, code };
  },
};

const uniq: CommandSpec = {
  name: 'uniq',
  summary: 'collapse repeated adjacent lines',
  usage: 'uniq [-c] [-d] [file...]',
  man: 'Collapses repeated ADJACENT lines — sort first if that matters.\n\n  -c  prefix each line with how many times it occurred\n  -d  print only the lines that repeated',
  run({ argv, stdin, ctx }: Invocation) {
    const { flags, operands, error } = shortFlags(argv, 'cd', 'uniq');
    if (error) return fail(error, 2);

    const { sources, stderr, code } = gather('uniq', operands, stdin, ctx);
    const lines = sources.flatMap((source) => toLines(source.text));
    const groups: { line: string; count: number }[] = [];

    for (const line of lines) {
      const last = groups[groups.length - 1];
      if (last && last.line === line) last.count++;
      else groups.push({ line, count: 1 });
    }

    const out = groups
      .filter((group) => !flags.has('d') || group.count > 1)
      .map((group) => (flags.has('c') ? `${String(group.count).padStart(7)} ${group.line}` : group.line));

    return { stdout: fromLines(out), stderr, code };
  },
};

export const textCommands: CommandSpec[] = [grep, echo, head, tail, wc, sort, uniq];
