import { expand, resolve } from '../fs/path';
import type { Vfs } from '../fs/vfs';
import type { Env } from '../shell/env';
import type { CommandRegistry } from '../commands/types';

export interface Completion {
  /** Novo conteúdo do token sob o cursor. */
  replacement: string;
  /** Candidatos, para o Tab duplo listar. */
  candidates: string[];
  /** Sufixo a acrescentar quando a escolha é única (espaço, ou nada após `/`). */
  suffix: string;
}

/** Prefixo comum a todos os candidatos — é até onde um Tab pode avançar sozinho. */
function commonPrefix(values: string[]): string {
  if (values.length === 0) return '';
  let prefix = values[0]!;
  for (const value of values.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < value.length && prefix[i] === value[i]) i++;
    prefix = prefix.slice(0, i);
  }
  return prefix;
}

/** Início do token que o cursor está tocando. */
export function tokenStart(line: string, cursor: number): number {
  let start = cursor;
  while (start > 0 && !/[\s|>]/.test(line[start - 1]!)) start--;
  return start;
}

export function complete(
  line: string,
  cursor: number,
  ctx: { vfs: Vfs; env: Env; registry: CommandRegistry },
): Completion {
  const start = tokenStart(line, cursor);
  const token = line.slice(start, cursor);
  const before = line.slice(0, start).trim();

  // Primeira palavra da linha (ou logo depois de um pipe) → nome de comando.
  const isCommandSlot = before === '' || before.endsWith('|');

  if (isCommandSlot && !token.includes('/')) {
    const names = [...ctx.registry.values()]
      .filter((spec) => !spec.hidden && spec.name.startsWith(token))
      .map((spec) => spec.name)
      .sort();
    if (names.length === 1) return { replacement: names[0]!, candidates: names, suffix: ' ' };
    return { replacement: commonPrefix(names) || token, candidates: names, suffix: '' };
  }

  const expanded = expand(token, ctx.env.home);
  const slash = expanded.lastIndexOf('/');
  // Sem barra nenhuma, o diretório é o atual — `dirname('proj')` devolveria `/`,
  // que mandaria a busca para a raiz.
  const dirPart = slash === -1 ? '.' : expanded.slice(0, slash + 1);
  const prefix = expanded.slice(slash + 1);
  const absoluteDir = resolve(ctx.env.cwd, dirPart);

  const matches = ctx.vfs
    .list(absoluteDir, prefix.startsWith('.'))
    .filter((entry) => entry.name.startsWith(prefix))
    .map((entry) => ({ name: entry.name, isDir: entry.node.kind === 'dir' }));

  if (matches.length === 0) return { replacement: token, candidates: [], suffix: '' };

  // O token volta como o visitante o escreveu (com `~` e caminho relativo intactos),
  // só com a última parte trocada.
  const head = prefix === '' ? token : token.slice(0, token.length - prefix.length);
  const candidates = matches.map((match) => (match.isDir ? `${match.name}/` : match.name));

  if (matches.length === 1) {
    const only = matches[0]!;
    return {
      replacement: head + only.name + (only.isDir ? '/' : ''),
      candidates,
      suffix: only.isDir ? '' : ' ',
    };
  }

  return { replacement: head + commonPrefix(matches.map((m) => m.name)), candidates, suffix: '' };
}
