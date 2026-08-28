/**
 * Formatação dos números da máquina no formato que as ferramentas de verdade
 * usam. É detalhe, mas é o detalhe: um `df` com as colunas fora de lugar
 * denuncia a imitação mais rápido do que qualquer outra coisa.
 */

import { fixed, t } from '../i18n';

const UNITS = ['K', 'M', 'G', 'T', 'P'];

/**
 * Tamanho legível a partir de kB, como o `-h` do `df` e do `free`.
 *
 * Abaixo de 10 a unidade ganha uma casa decimal e acima dela não — é a regra do
 * coreutils, e é o que faz `9.5G` e `114G` conviverem alinhados na mesma coluna.
 */
export function human(kb: number, suffix = ''): string {
  // Zero não leva unidade escalada: o `free -h` imprime `0B` e o `df -h`, `0`.
  if (kb <= 0) return suffix ? '0B' : '0';

  let value = kb;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }

  const text = value < 10 ? fixed(value, 1) : String(Math.round(value));
  return `${text}${UNITS[unit]}${suffix}`;
}

/** MiB com uma casa, que é como o `top` mostra memória. */
export const mib = (kb: number): string => fixed(kb / 1024, 1);

/** `4 days, 10:48` — o formato do `uptime` e do cabeçalho do `top`. */
export function uptimeShort(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const clock = `${hours}:${String(minutes).padStart(2, '0')}`;
  if (days > 0) return `${t().days(days)}, ${clock}`;
  if (hours > 0) return clock;
  return t().minutes(minutes);
}

/** `4 days, 10 hours, 48 mins` — o formato do `neofetch`. */
export function uptimeLong(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(t().days(days));
  if (hours > 0) parts.push(t().hours(hours));
  parts.push(t().minutes(minutes));
  return parts.join(', ');
}

/** `00:04:12` — a coluna TIME do `ps`. */
export function cpuTime(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** `4:12.30` — a coluna TIME+ do `top`, que conta centésimos. */
export function cpuTimePlus(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = fixed(seconds % 60, 2).padStart(5, '0');
  return `${minutes}:${rest}`;
}

/** `21:04:31` no fuso de quem está olhando. */
export function clock(date = new Date()): string {
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

export const load = (avg: readonly number[]): string => avg.map((n) => fixed(n, 2)).join(', ');

/**
 * Monta uma tabela alinhada. `align` diz, por coluna, se o conteúdo encosta à
 * direita — números encostam, texto não.
 */
export function table(rows: string[][], align: boolean[], gap = 1): string[] {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] ?? 0, cell.length);
    });
  }

  return rows.map((row) =>
    row
      .map((cell, index) => {
        // A última coluna nunca é preenchida: espaço à direita vira lixo no fim
        // da linha, e some no `grep`.
        if (index === row.length - 1) return align[index] ? cell.padStart(widths[index]!) : cell;
        const padded = align[index] ? cell.padStart(widths[index]!) : cell.padEnd(widths[index]!);
        return padded + ' '.repeat(gap);
      })
      .join('')
      .trimEnd(),
  );
}

/**
 * Quebra o texto na largura dada, respeitando palavra.
 *
 * Palavra que sozinha não cabe é cortada: numa tela de 40 colunas, um caminho
 * longo tem que aparecer inteiro em duas linhas, não sumir na margem.
 */
export function wrap(text: string, width: number): string[] {
  const lines: string[] = [];

  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter((piece) => piece !== '')) {
      if (line === '') line = word;
      else if (line.length + 1 + word.length <= width) line += ' ' + word;
      else {
        lines.push(line);
        line = word;
      }
      while (line.length > width) {
        lines.push(line.slice(0, width));
        line = line.slice(width);
      }
    }
    lines.push(line);
  }

  return lines;
}
