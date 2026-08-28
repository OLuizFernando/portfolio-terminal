import { docs, setLocale, t } from '../i18n';
import { fail, ok, type CommandSpec, type Invocation } from './types';

const lang: CommandSpec = {
  name: 'lang',
  summary: 'switch the language',
  usage: 'lang [<code>]',
  primary: true,
  man:
    'Switches the language of the machine, and remembers it for next time.\n\n' +
    '  lang            print the current language and the ones available\n' +
    '  lang <code>     switch to it\n\n' +
    'It changes the content of the files and the shell along with it: help, the\n' +
    'manuals, the error messages, and the labels of free, df and top. What does\n' +
    'not change is command names and flags — `ls` and `-l` are the interface of\n' +
    'the machine, and no locale on earth translates those. The kernel lines at\n' +
    'boot stay too: they come from the kernel, which speaks English in every\n' +
    'language.\n\n' +
    'The language never changes on its own. Your browser is asked once, at boot,\n' +
    'and only to decide whether to print a one-line hint. Choosing is yours.',
  run({ argv, ctx }: Invocation) {
    const available = ctx.langs.join(', ');
    const target = argv[1];

    if (target === undefined) {
      return ok(t().langCurrent(ctx.env.lang, available));
    }
    if (argv.length > 2) return fail(t().usageLine(docs(lang).usage), 2);

    // Valida antes de desmontar qualquer coisa: um código errado não pode
    // deixar a sessão numa árvore pela metade.
    if (!ctx.langs.includes(target)) {
      return fail(t().langNoSuch(target, available), 2);
    }
    if (target === ctx.env.lang) return ok(`${target}\n`);

    ctx.remount(target);
    ctx.env.lang = target;
    // O locale acompanha a árvore: sem isto o `help` seguiria no idioma antigo
    // enquanto o `cat` já responderia no novo.
    setLocale(target);

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
