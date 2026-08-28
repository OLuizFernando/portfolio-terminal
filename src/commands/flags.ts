/**
 * Parsing de flags curtas, compartilhado pelos comandos.
 *
 * Mora fora do nav.ts desde que a camada 3 apareceu: `ls`, `tree`, `free`,
 * `df` e `uname` usam a mesma regra, e um deles não deve importar do outro só
 * para pegar um utilitário.
 */

import { t } from '../i18n';

export function parseFlags(
  argv: string[],
  known: string,
  command: string,
): { flags: Set<string>; operands: string[]; error?: string } {
  const flags = new Set<string>();
  const operands: string[] = [];

  for (const arg of argv.slice(1)) {
    if (arg.length > 1 && arg.startsWith('-') && !arg.startsWith('--')) {
      for (const flag of arg.slice(1)) {
        if (!known.includes(flag)) {
          return { flags, operands, error: t().invalidOption(command, flag) };
        }
        flags.add(flag);
      }
    } else {
      operands.push(arg);
    }
  }

  return { flags, operands };
}
