import type { Vfs } from '../fs/vfs';
import type { Env } from '../shell/env';

/** O que um comando pode fazer com o terminal além de escrever em stdout. */
export interface TerminalControl {
  clear(): void;
  /** Escreve direto, sem passar por pipe/redirect (boot, `top` ao vivo). */
  write(text: string): void;
  /**
   * Escreve bytes crus e avisa quando o terminal terminou de processá-los.
   *
   * O callback é o que permite escrever um frame por vez: sem ele, um programa
   * que desenha rápido enfileira trabalho no xterm.js mais rápido do que ele
   * consome, e a latência vira engasgo.
   */
  writeBytes(data: Uint8Array, done: () => void): void;
  /** Encerra a sessão: nada mais é aceito até recarregar. */
  exit(): void;
  /** Proporção largura/altura de uma célula, medida no DOM. */
  cellAspect(): number;
  /** Troca o tamanho da fonte. Devolve como voltar ao que era. */
  setFontSize(size: number): () => void;
  readonly cols: number;
  readonly rows: number;
}

export interface ShellContext {
  vfs: Vfs;
  env: Env;
  term: TerminalControl;
  registry: CommandRegistry;
  /** Grava as preferências da sessão (idioma, fonte) no navegador. */
  savePrefs(): void;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface Invocation {
  argv: string[];
  stdin: string;
  /** A saída vai para um pipe ou arquivo, não para a tela. */
  piped: boolean;
  ctx: ShellContext;
}

export interface CommandSpec {
  name: string;
  /** Uma linha, usada pelo `help`. */
  summary: string;
  usage: string;
  /** Corpo do `man`. Sem isso, o man monta um texto mínimo a partir de usage/summary. */
  man?: string;
  /** Aparece no `help` curto (6-8 comandos). */
  primary?: boolean;
  /**
   * Fora de qualquer listagem, inclusive `help --all`. Reservado a reações a
   * comandos destrutivos — não a easter eggs, que são comandos e aparecem.
   */
  hidden?: boolean;
  run(inv: Invocation): CommandResult | Promise<CommandResult>;
}

export type CommandRegistry = Map<string, CommandSpec>;

export const ok = (stdout = ''): CommandResult => ({ stdout, stderr: '', code: 0 });
export const fail = (stderr: string, code = 1): CommandResult => ({ stdout: '', stderr, code });

/** Divide um texto em linhas descartando o `\n` final, como as ferramentas Unix fazem. */
export function toLines(text: string): string[] {
  if (text === '') return [];
  return text.replace(/\n$/, '').split('\n');
}

export function fromLines(lines: string[]): string {
  return lines.length === 0 ? '' : lines.join('\n') + '\n';
}
