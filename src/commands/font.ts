import { docs, t } from '../i18n';
import { fail, ok, type CommandSpec, type Invocation } from './types';

/**
 * Limites do texto do shell, não da imagem do DOOM: abaixo de 8px o conteúdo
 * deixa de ser legível, que é o oposto do ponto deste comando. O `doom --font`
 * tem uma faixa própria, mais larga, porque lá o caractere é pixel, não letra.
 */
const MIN_SIZE = 8;
const MAX_SIZE = 32;

const font: CommandSpec = {
  name: 'font',
  summary: 'change the terminal font size',
  usage: 'font [<px> | reset]',
  man:
    'Changes how big the text is, and remembers it for next time.\n\n' +
    '  font            print the current size\n' +
    `  font <px>       set it, between ${MIN_SIZE} and ${MAX_SIZE}\n` +
    '  font reset      back to the default for this screen\n\n' +
    'The size is stored in this browser only. It does not follow you to another\n' +
    'machine, and it never reaches the server.\n\n' +
    'This is the size of the text you are reading. `doom` has its own --font,\n' +
    'which only applies while the game is running.',
  run({ argv, ctx }: Invocation) {
    const argument = argv[1];
    // O padrão é do aparelho, não do projeto: telas de toque começam menores.
    const fallback = ctx.env.defaultFontSize;

    if (argument === undefined) {
      return ok(t().fontCurrent(ctx.env.fontSize, fallback, MIN_SIZE, MAX_SIZE));
    }

    if (argv.length > 2) return fail(t().usageLine(docs(font).usage), 2);

    const size = argument === 'reset' ? fallback : Number(argument);

    if (!Number.isInteger(size)) {
      return fail(t().fontNotASize(argument) + t().usageLine(docs(font).usage), 2);
    }
    if (size < MIN_SIZE || size > MAX_SIZE) {
      return fail(t().fontRange(MIN_SIZE, MAX_SIZE), 2);
    }

    ctx.term.setFontSize(size);
    ctx.env.fontSize = size;
    ctx.savePrefs();

    return ok(`${size}px\n`);
  },
};

export const fontCommands: CommandSpec[] = [font];
