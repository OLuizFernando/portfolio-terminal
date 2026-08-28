import { expand, resolve } from '../fs/path';
import { expandGlob, hasMagic } from './glob';
import { parse, ShellError, type Pipeline, type SimpleCommand } from './parser';
import type { ShellContext } from '../commands/types';
import { t } from '../i18n';

export interface ExecOutcome {
  /** Texto já pronto para a tela (stdout não redirecionado + stderr). */
  output: string;
  code: number;
}

/** `~` e globs viram caminhos concretos antes do comando ver o argv. */
function expandWords(command: SimpleCommand, ctx: ShellContext): string[] {
  const argv: string[] = [];

  for (const [index, word] of command.argv.entries()) {
    const value = word.quoted ? word.value : expand(word.value, ctx.env.home);

    // O nome do comando nunca sofre glob — `l*` não deve virar `ls`.
    if (word.quoted || index === 0 || !hasMagic(value)) {
      argv.push(value);
      continue;
    }

    argv.push(...expandGlob(ctx.vfs, ctx.env.cwd, value));
  }

  return argv;
}

async function runPipeline(pipeline: Pipeline, ctx: ShellContext): Promise<ExecOutcome> {
  let stdin = '';
  let output = '';
  let code = 0;

  for (const [index, command] of pipeline.entries()) {
    const isLast = index === pipeline.length - 1;
    const argv = expandWords(command, ctx);
    const name = argv[0]!;
    const spec = ctx.registry.get(name);

    if (!spec) {
      output += t().commandNotFound(name) + t().tryHelp;
      stdin = '';
      code = 127;
      continue;
    }

    // Comandos formatam diferente quando a saída não é a tela — é o que faz
    // `ls | wc -l` contar arquivos em vez de contar colunas.
    const piped = !isLast || command.redirect !== null;
    const result = await spec.run({ argv, stdin, piped, sudo: false, ctx });
    output += result.stderr;
    code = result.code;

    if (command.redirect) {
      const target = resolve(ctx.env.cwd, expand(command.redirect.target, ctx.env.home));
      if (ctx.vfs.isDir(target)) {
        output += t().redirectIsDir(command.redirect.target);
        code = 1;
      } else {
        ctx.vfs.writeFile(target, result.stdout, command.redirect.op === '>>');
      }
      stdin = '';
    } else {
      stdin = result.stdout;
      if (isLast) output += stdin;
    }
  }

  return { output, code };
}

export async function execute(line: string, ctx: ShellContext): Promise<ExecOutcome> {
  let script;
  try {
    script = parse(line);
  } catch (error) {
    if (error instanceof ShellError) return { output: error.message + '\n', code: 2 };
    throw error;
  }

  let output = '';
  let code = 0;
  let skip = false;

  for (const item of script) {
    if (!skip) {
      const result = await runPipeline(item.pipeline, ctx);
      output += result.output;
      code = result.code;
    }

    // `&&` só continua se deu certo; `||` só continua se deu errado.
    if (item.separator === '&&') skip = code !== 0;
    else if (item.separator === '||') skip = code === 0;
    else skip = false;
  }

  return { output, code };
}
