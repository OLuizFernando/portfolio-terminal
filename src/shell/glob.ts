import type { Vfs } from '../fs/vfs';
import { normalize } from '../fs/path';

const HAS_MAGIC = /[*?[]/;

export function hasMagic(pattern: string): boolean {
  return HAS_MAGIC.test(pattern);
}

function segmentToRegExp(segment: string): RegExp {
  let source = '';
  for (const char of segment) {
    if (char === '*') source += '[^/]*';
    else if (char === '?') source += '[^/]';
    else source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

/**
 * Expande um glob contra o filesystem simulado, segmento a segmento — o que faz
 * `cat projects/*​/stack.txt` funcionar.
 *
 * Sem correspondência, devolve o padrão original intacto: é o comportamento do
 * bash com `nullglob` desligado, e o erro do comando fica fiel ("No such file").
 */
export function expandGlob(vfs: Vfs, cwd: string, pattern: string): string[] {
  if (!hasMagic(pattern)) return [pattern];

  const absolute = pattern.startsWith('/');
  const segments = (absolute ? pattern.slice(1) : pattern).split('/').filter((s) => s !== '');
  let candidates = [absolute ? '' : normalize(cwd).replace(/\/$/, '')];

  for (const segment of segments) {
    const next: string[] = [];

    if (!hasMagic(segment)) {
      for (const base of candidates) next.push(`${base}/${segment}`);
    } else {
      const re = segmentToRegExp(segment);
      const includeHidden = segment.startsWith('.');
      for (const base of candidates) {
        for (const { name } of vfs.list(base || '/', includeHidden)) {
          if (re.test(name)) next.push(`${base}/${name}`);
        }
      }
    }

    candidates = next;
    if (candidates.length === 0) return [pattern];
  }

  const matches = candidates.filter((p) => vfs.exists(p)).sort();
  if (matches.length === 0) return [pattern];

  // Devolve relativo quando o padrão era relativo, pra saída do `ls` não virar
  // um monte de caminho absoluto.
  if (absolute) return matches;
  const prefix = normalize(cwd).replace(/\/$/, '') + '/';
  return matches.map((p) => (p.startsWith(prefix) ? p.slice(prefix.length) : p));
}
