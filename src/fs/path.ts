/** Utilitários de caminho POSIX. Nada aqui toca o filesystem — só string. */

export function isAbsolute(p: string): boolean {
  return p.startsWith('/');
}

/** Resolve `.`, `..` e barras repetidas. Assume caminho já absoluto. */
export function normalize(p: string): string {
  const out: string[] = [];
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return '/' + out.join('/');
}

export function resolve(cwd: string, p: string): string {
  return normalize(isAbsolute(p) ? p : `${cwd}/${p}`);
}

export function dirname(p: string): string {
  const norm = normalize(p);
  const i = norm.lastIndexOf('/');
  return i <= 0 ? '/' : norm.slice(0, i);
}

export function basename(p: string): string {
  const norm = normalize(p);
  if (norm === '/') return '/';
  return norm.slice(norm.lastIndexOf('/') + 1);
}

export function join(...parts: string[]): string {
  return normalize(parts.join('/'));
}

/** Troca o prefixo da home por `~`, como o prompt do bash faz. */
export function contract(p: string, home: string): string {
  if (p === home) return '~';
  if (p.startsWith(home + '/')) return '~' + p.slice(home.length);
  return p;
}

/** Expande um `~` inicial. */
export function expand(p: string, home: string): string {
  if (p === '~') return home;
  if (p.startsWith('~/')) return home + p.slice(1);
  return p;
}
