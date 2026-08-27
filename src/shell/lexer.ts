export interface Word {
  value: string;
  /** Palavra veio (parcialmente) entre aspas — não sofre expansão de glob. */
  quoted: boolean;
}

export type Separator = '&&' | '||' | ';';

export type Token =
  | { type: 'word'; word: Word }
  | { type: 'pipe' }
  | { type: 'separator'; op: Separator }
  | { type: 'redirect'; op: '>' | '>>' };

export class ShellError extends Error {}

const SPECIAL = new Set([' ', '\t', '|', '>', ';', '&']);

/**
 * Quebra a linha em tokens, respeitando aspas simples, aspas duplas e barra
 * invertida. Aspas simples são literais; aspas duplas também (não há expansão de
 * variável neste shell), mas ambas marcam a palavra como `quoted` para o glob
 * não tocar nela.
 */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const char = input[i]!;

    if (char === ' ' || char === '\t') {
      i++;
      continue;
    }

    if (char === ';') {
      tokens.push({ type: 'separator', op: ';' });
      i++;
      continue;
    }

    if (char === '&') {
      if (input[i + 1] !== '&') throw new ShellError("bash: syntax error near unexpected token `&'");
      tokens.push({ type: 'separator', op: '&&' });
      i += 2;
      continue;
    }

    if (char === '|') {
      if (input[i + 1] === '|') {
        tokens.push({ type: 'separator', op: '||' });
        i += 2;
      } else {
        tokens.push({ type: 'pipe' });
        i++;
      }
      continue;
    }

    if (char === '>') {
      if (input[i + 1] === '>') {
        tokens.push({ type: 'redirect', op: '>>' });
        i += 2;
      } else {
        tokens.push({ type: 'redirect', op: '>' });
        i++;
      }
      continue;
    }

    let value = '';
    let quoted = false;

    while (i < input.length && !SPECIAL.has(input[i]!)) {
      const c = input[i]!;

      if (c === '\\') {
        if (i + 1 >= input.length) throw new ShellError('bash: syntax error: unexpected end of input');
        value += input[i + 1];
        quoted = true;
        i += 2;
        continue;
      }

      if (c === "'" || c === '"') {
        const close = input.indexOf(c, i + 1);
        if (close === -1) throw new ShellError(`bash: unexpected EOF while looking for matching \`${c}'`);
        value += input.slice(i + 1, close);
        quoted = true;
        i = close + 1;
        continue;
      }

      value += c;
      i++;
    }

    tokens.push({ type: 'word', word: { value, quoted } });
  }

  return tokens;
}
