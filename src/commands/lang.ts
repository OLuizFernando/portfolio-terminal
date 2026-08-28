import { fail, ok, type CommandSpec, type Invocation } from './types';

const lang: CommandSpec = {
  name: 'lang',
  summary: 'switch the language of the content',
  usage: 'lang [<code>]',
  primary: true,
  man:
    'Switches the language the files are written in, and remembers it for next\n' +
    'time.\n\n' +
    '  lang            print the current language and the ones available\n' +
    '  lang <code>     switch to it\n\n' +
    'Only the content changes. The shell itself — the commands, their flags,\n' +
    'their errors, and this manual — stays in English, which is how a machine\n' +
    'with a translated home directory and an English locale actually behaves.\n\n' +
    'The language never changes on its own. Your browser is asked once, at boot,\n' +
    'and only to decide whether to print a one-line hint. Choosing is yours.',
  run({ argv, ctx }: Invocation) {
    const available = ctx.langs.join(', ');
    const target = argv[1];

    if (target === undefined) {
      return ok(`${ctx.env.lang} (available: ${available})\n`);
    }
    if (argv.length > 2) return fail(`usage: ${lang.usage}\n`, 2);

    // Valida antes de desmontar qualquer coisa: um código errado não pode
    // deixar a sessão numa árvore pela metade.
    if (!ctx.langs.includes(target)) {
      return fail(`lang: no such language: ${target}\navailable: ${available}\n`, 2);
    }
    if (target === ctx.env.lang) return ok(`${target}\n`);

    ctx.remount(target);
    ctx.env.lang = target;

    // Os caminhos são idênticos nos dois idiomas de propósito, então o
    // diretório atual quase sempre sobrevive à troca. O "quase" é o que este
    // bloco existe para cobrir: uma tradução incompleta não pode deixar o
    // visitante preso num diretório que deixou de existir, sem `cd` que resolva.
    if (!ctx.vfs.isDir(ctx.env.cwd)) {
      ctx.env.oldcwd = ctx.env.cwd;
      ctx.env.cwd = ctx.env.home;
    }

    ctx.savePrefs();
    return ok(`${target}\n`);
  },
};

export const langCommands: CommandSpec[] = [lang];
