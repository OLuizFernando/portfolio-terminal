import type { FsNode } from '../fs/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SIX_MONTHS = 15552000; // segundos

const pad = (n: number) => String(n).padStart(2, '0');

/** `Aug 26 21:04` para o recente, `Aug 26  2024` para o antigo — como o `ls -l`. */
export function formatDate(mtime: number, now = Math.floor(Date.now() / 1000)): string {
  const date = new Date(mtime * 1000);
  const day = String(date.getDate()).padStart(2, ' ');
  const month = MONTHS[date.getMonth()]!;
  if (now - mtime > SIX_MONTHS) return `${month} ${day}  ${date.getFullYear()}`;
  return `${month} ${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function sizeOf(node: FsNode): number {
  return node.kind === 'dir' ? 4096 : new TextEncoder().encode(node.content).length;
}

export function modeOf(node: FsNode): string {
  return node.kind === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--';
}

/**
 * Layout em colunas do `ls`. Sem cor na paleta, a barra final é o único jeito de
 * distinguir diretório de arquivo — por isso ela não é opcional aqui.
 */
export function columns(entries: string[], width: number): string {
  if (entries.length === 0) return '';

  const longest = Math.max(...entries.map((e) => e.length));
  const columnWidth = longest + 2;
  const perRow = Math.max(1, Math.floor(width / columnWidth));
  if (perRow === 1) return entries.join('\n') + '\n';

  const rows = Math.ceil(entries.length / perRow);
  const lines: string[] = [];

  // Preenche por coluna, como o `ls` de verdade.
  for (let row = 0; row < rows; row++) {
    let line = '';
    for (let col = 0; col < perRow; col++) {
      const entry = entries[col * rows + row];
      if (entry === undefined) continue;
      line += col * rows + row + rows >= entries.length ? entry : entry.padEnd(columnWidth);
    }
    lines.push(line.trimEnd());
  }

  return lines.join('\n') + '\n';
}
