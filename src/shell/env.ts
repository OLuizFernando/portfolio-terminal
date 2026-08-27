import { contract } from '../fs/path';

export const HOME = '/home/guest';
/** Tamanho de fonte padrão do terminal. O comando `font` muda em runtime. */
export const DEFAULT_FONT_SIZE = 14;
/**
 * O padrão de quem chega pelo celular. A 14px uma tela de 390px cabe 43 colunas,
 * e `df`, `free` e o cabeçalho do `top` são escritos para 50 e poucas.
 */
export const TOUCH_FONT_SIZE = 12;
export const USER = 'guest';
export const HOST = 'oluizfernando';

/** Estado mutável da sessão: onde o visitante está, o que ele já digitou, como prefere ver. */
export class Env {
  cwd = HOME;
  /** Para o `cd -`. */
  oldcwd = HOME;
  readonly home = HOME;
  readonly user = USER;
  readonly host = HOST;
  lang = 'en';
  fontSize = DEFAULT_FONT_SIZE;
  /** O padrão desta tela, para onde o `font reset` volta. Depende do aparelho. */
  defaultFontSize = DEFAULT_FONT_SIZE;
  /** Scanlines e brilho de fósforo. Preferência, como o tamanho da fonte. */
  crt = false;
  history: string[] = [];

  get shortCwd(): string {
    return contract(this.cwd, this.home);
  }

  prompt(): string {
    return `\x1b[1m${this.user}@${this.host}\x1b[0m:${this.shortCwd}$ `;
  }
}
