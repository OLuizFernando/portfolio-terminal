import type { Vfs } from '../fs/vfs';
import type { Env } from '../shell/env';
import type { SystemClient } from '../system/stats';

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
  /** Liga ou desliga o efeito de tubo. Só mexe em CSS. */
  setCrt(on: boolean): void;
  readonly cols: number;
  readonly rows: number;
}

export interface ShellContext {
  vfs: Vfs;
  env: Env;
  term: TerminalControl;
  registry: CommandRegistry;
  /** Acesso à máquina de verdade. Pode estar fora do ar; os comandos sabem disso. */
  system: SystemClient;
  /** Grava as preferências da sessão (idioma, fonte) no navegador. */
  savePrefs(): void;
  /** Idiomas que o manifesto trouxe. O `lang` só aceita um destes. */
  readonly langs: string[];
  /**
   * Troca a árvore montada pela do idioma pedido.
   *
   * Quem implementa precisa refazer os pontos de montagem sintéticos —
   * `/usr/bin`, `/proc` e o `~/.bash_history` não vêm do manifesto e vão embora
   * junto com a árvore antiga.
   */
  remount(lang: string): void;
  /**
   * Reinicia a sessão: remonta a árvore do idioma atual, volta para o home e
   * roda a sequência de boot de novo.
   *
   * É o caminho de volta do `rm -rf /`, e o único caminho de volta que não
   * exige recarregar a página.
   */
  reboot(): Promise<void>;
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
  /**
   * O comando foi chamado através do `sudo`.
   *
   * O executor sempre passa `false`: quem levanta é o próprio `sudo`, ao
   * despachar o resto do argv. Um comando que não olha para isto roda igual
   * com e sem privilégio, que é como o sudo se comporta de verdade.
   */
  sudo: boolean;
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
