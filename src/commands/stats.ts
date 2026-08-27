import { fetchUsage, type Usage } from '../system/telemetry';
import { wrap } from '../system/format';
import { SystemOffline } from '../system/stats';
import { fail, fromLines, ok, type CommandSpec, type Invocation } from './types';

/** Largura máxima da barra. Cabe no celular sem embrulhar. */
const BAR = 24;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-08-27T19:47:40Z` vira `27 Aug 2026`. Data, não carimbo. */
function day(iso: string | null): string {
  const date = iso === null ? null : new Date(iso);
  if (date === null || Number.isNaN(date.getTime())) return 'the beginning';
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

const count = (value: number) => value.toLocaleString('en-US');

/**
 * Ranking com barra. A barra é proporcional ao primeiro colocado, não ao total:
 * com trinta comandos no ar, proporção do total dá trinta barras vazias.
 */
export function ranking(rows: [string, number][], cols: number, bars: boolean): string[] {
  if (rows.length === 0) return [];

  const nameWidth = Math.max(...rows.map(([name]) => name.length));
  const countWidth = Math.max(...rows.map(([, value]) => count(value).length));
  const most = rows[0]![1];
  // Sem espaço para barra, o ranking continua sendo um ranking.
  const width = Math.min(BAR, cols - nameWidth - countWidth - 8);

  return rows.map(([name, value]) => {
    const head = `  ${name.padEnd(nameWidth)}  ${count(value).padStart(countWidth)}`;
    if (!bars || width < 4) return head;
    return `${head}  ${'█'.repeat(Math.max(1, Math.round((value / most) * width)))}`;
  });
}

export function report(usage: Usage, cols: number, bars: boolean): string[] {
  // A prosa embrulha na largura da tela; a mais de 76 colunas ela para de
  // crescer, porque linha longa demais se lê pior do que linha curta.
  const say = (text: string) => wrap(text, Math.max(20, Math.min(cols, 76)));

  if (usage.total === 0) return say('Nothing recorded yet. You are early.');

  const where = usage.countries > 1 ? `, from ${usage.countries} countries` : '';
  const lines = [...say(`${count(usage.total)} commands typed here since ${day(usage.since)}${where}`), ''];

  lines.push(...ranking(usage.top, cols, bars));

  if (usage.missing.length > 0) {
    lines.push('', ...say('not commands here, but people tried:'), '');
    lines.push(...ranking(usage.missing, cols, bars));
  }

  lines.push(
    '',
    ...say(
      'Nobody is identified: no IP, no cookie, no session. Only the first word ' +
        'of each line, and the country. `cat /etc/privacy` for the whole of it.',
    ),
  );

  return lines;
}

const stats: CommandSpec = {
  name: 'stats',
  summary: 'what people type here',
  usage: 'stats',
  man:
    'What visitors have been typing into this terminal.\n\n' +
    'Two rankings: the commands people run, and the things they typed that are\n' +
    'not commands here — which is the most honest list of what is missing.\n\n' +
    'The recording keeps the first word of each line and the country it came\n' +
    'from. No IP, no cookie, no session identifier, not even a clock: the server\n' +
    'dates each line on arrival. `cat /etc/privacy` says it in full.\n\n' +
    'Your own commands are in here too, including this one.',
  async run({ ctx, piped }: Invocation) {
    try {
      // Piped não leva barra: `stats | grep doom` tem que devolver a linha.
      return ok(fromLines(report(await fetchUsage(), ctx.term.cols, !piped)));
    } catch (caught) {
      if (caught instanceof SystemOffline) return fail('stats: cannot reach the machine\n');
      throw caught;
    }
  },
};

export const statsCommands: CommandSpec[] = [stats];
