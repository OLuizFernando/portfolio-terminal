import type { Terminal } from '@xterm/xterm';
import type { Completion } from './completion';

export interface LineEditorOptions {
  /** Prompt já pronto, sem ANSI — a formatação é aplicada na hora de desenhar. */
  prompt(): string;
  submit(line: string): Promise<void> | void;
  complete(line: string, cursor: number): Completion;
  history: string[];
  onHistoryChange?(history: string[]): void;
}

const MAX_HISTORY = 500;

/**
 * Edição de linha sobre o xterm.js: cursor, histórico, Tab-completion e os
 * atalhos que a mão de quem usa terminal já espera.
 *
 * O redesenho não confia na posição implícita do cursor: a linha é quebrada em
 * pedaços do tamanho exato da tela e emitida com `\r\n` explícito. Assim a conta
 * de linha/coluna fecha mesmo quando o comando embrulha em várias linhas.
 */
export class LineEditor {
  private buffer = '';
  private cursor = 0;
  /** Linha (relativa ao início do prompt) onde o cursor foi deixado. */
  private renderRow = 0;
  private historyIndex: number | null = null;
  private draft = '';
  private lastWasTab = false;
  private busy = false;
  private disposed = false;

  constructor(
    private readonly term: Terminal,
    private readonly options: LineEditorOptions,
  ) {}

  get line(): string {
    return this.buffer;
  }

  /** Desenha o prompt e passa a aceitar digitação. */
  start(): void {
    this.buffer = '';
    this.cursor = 0;
    this.renderRow = 0;
    this.historyIndex = null;
    this.term.write(this.decoratedPrompt());
    this.renderRow = 0;
    this.moveTo(this.promptLength());
  }

  dispose(): void {
    this.disposed = true;
  }

  handle(data: string): void {
    if (this.busy || this.disposed) return;

    let i = 0;
    while (i < data.length) {
      const rest = data.slice(i);

      if (rest.startsWith('\x1b[')) {
        const consumed = this.handleEscape(rest);
        if (consumed > 0) {
          i += consumed;
          continue;
        }
      }

      const char = data[i]!;
      i++;

      if (char === '\r' || char === '\n') {
        this.submit();
        return;
      }

      const isTab = char === '\t';
      if (isTab) this.tab();
      else this.handleChar(char);
      this.lastWasTab = isTab;
    }
  }

  private handleChar(char: string): void {
    switch (char) {
      case '\x7f':
      case '\b':
        if (this.cursor > 0) {
          this.buffer = this.buffer.slice(0, this.cursor - 1) + this.buffer.slice(this.cursor);
          this.cursor--;
          this.render();
        }
        return;
      case '\x03': // Ctrl+C — abandona a linha, não a executa
        this.term.write('^C\r\n');
        this.start();
        return;
      case '\x0c': // Ctrl+L
        this.term.write('\x1b[2J\x1b[H');
        this.redrawFromScratch();
        return;
      case '\x01': // Ctrl+A
        this.cursor = 0;
        this.render();
        return;
      case '\x05': // Ctrl+E
        this.cursor = this.buffer.length;
        this.render();
        return;
      case '\x15': // Ctrl+U
        this.buffer = this.buffer.slice(this.cursor);
        this.cursor = 0;
        this.render();
        return;
      case '\x0b': // Ctrl+K
        this.buffer = this.buffer.slice(0, this.cursor);
        this.render();
        return;
      case '\x17': { // Ctrl+W
        const head = this.buffer.slice(0, this.cursor).replace(/\S+\s*$/, '');
        this.buffer = head + this.buffer.slice(this.cursor);
        this.cursor = head.length;
        this.render();
        return;
      }
      default:
        if (char < ' ') return; // ignora controles não mapeados
        this.buffer = this.buffer.slice(0, this.cursor) + char + this.buffer.slice(this.cursor);
        this.cursor += char.length;
        this.render();
    }
  }

  /** Devolve quantos bytes da sequência foram consumidos, ou 0 se não reconhecida. */
  private handleEscape(rest: string): number {
    const table: Record<string, () => void> = {
      'A': () => this.recallHistory(-1),
      'B': () => this.recallHistory(1),
      'C': () => {
        if (this.cursor < this.buffer.length) this.cursor++;
        this.render();
      },
      'D': () => {
        if (this.cursor > 0) this.cursor--;
        this.render();
      },
      'H': () => {
        this.cursor = 0;
        this.render();
      },
      'F': () => {
        this.cursor = this.buffer.length;
        this.render();
      },
      '3~': () => {
        if (this.cursor < this.buffer.length) {
          this.buffer = this.buffer.slice(0, this.cursor) + this.buffer.slice(this.cursor + 1);
          this.render();
        }
      },
      '1~': () => {
        this.cursor = 0;
        this.render();
      },
      '4~': () => {
        this.cursor = this.buffer.length;
        this.render();
      },
    };

    for (const [suffix, action] of Object.entries(table)) {
      if (rest.startsWith('\x1b[' + suffix)) {
        action();
        this.lastWasTab = false;
        return 2 + suffix.length;
      }
    }

    return 0;
  }

  private tab(): void {
    const result = this.options.complete(this.buffer, this.cursor);
    const start = this.tokenStart();
    const token = this.buffer.slice(start, this.cursor);

    if (result.replacement !== token) {
      const insertion = result.replacement + (result.candidates.length === 1 ? result.suffix : '');
      this.buffer = this.buffer.slice(0, start) + insertion + this.buffer.slice(this.cursor);
      this.cursor = start + insertion.length;
      this.render();
      return;
    }

    // Nada avançou: o segundo Tab é que mostra as opções.
    if (this.lastWasTab && result.candidates.length > 1) {
      this.term.write('\r\n');
      this.renderRow = 0;
      this.term.write(this.formatCandidates(result.candidates));
      this.redrawFromScratch();
    }
  }

  private formatCandidates(candidates: string[]): string {
    const width = Math.max(...candidates.map((c) => c.length)) + 2;
    const perRow = Math.max(1, Math.floor(this.term.cols / width));
    const lines: string[] = [];
    for (let i = 0; i < candidates.length; i += perRow) {
      lines.push(candidates.slice(i, i + perRow).map((c) => c.padEnd(width)).join('').trimEnd());
    }
    return lines.join('\r\n') + '\r\n';
  }

  private tokenStart(): number {
    let start = this.cursor;
    while (start > 0 && !/[\s|>]/.test(this.buffer[start - 1]!)) start--;
    return start;
  }

  private recallHistory(direction: -1 | 1): void {
    const history = this.options.history;
    if (history.length === 0) return;

    if (this.historyIndex === null) {
      if (direction === 1) return;
      this.draft = this.buffer;
      this.historyIndex = history.length - 1;
    } else {
      const next = this.historyIndex + direction;
      if (next < 0) return;
      if (next >= history.length) {
        this.historyIndex = null;
        this.buffer = this.draft;
        this.cursor = this.buffer.length;
        this.render();
        return;
      }
      this.historyIndex = next;
    }

    this.buffer = history[this.historyIndex]!;
    this.cursor = this.buffer.length;
    this.render();
  }

  private submit(): void {
    const line = this.buffer;
    this.moveTo(this.promptLength() + this.buffer.length);
    this.term.write('\r\n');
    this.renderRow = 0;
    this.busy = true;

    const history = this.options.history;
    if (line.trim() !== '' && history[history.length - 1] !== line.trim()) {
      history.push(line.trim());
      if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
      this.options.onHistoryChange?.(history);
    }

    void Promise.resolve(this.options.submit(line)).finally(() => {
      this.busy = false;
      if (!this.disposed) this.start();
    });
  }

  private promptLength(): number {
    return this.options.prompt().length;
  }

  private decoratedPrompt(): string {
    const prompt = this.options.prompt();
    const at = prompt.indexOf(':');
    if (at === -1) return prompt;
    return `\x1b[1m${prompt.slice(0, at)}\x1b[0m${prompt.slice(at)}`;
  }

  /** Apaga o bloco inteiro e o reescreve — usado após Ctrl+L e após listar o Tab. */
  private redrawFromScratch(): void {
    this.renderRow = 0;
    this.term.write(this.decoratedPrompt());
    this.renderRow = 0;
    this.writeBuffer(this.promptLength());
  }

  private render(): void {
    if (this.renderRow > 0) this.term.write(`\x1b[${this.renderRow}A`);
    this.term.write('\r\x1b[J');
    this.term.write(this.decoratedPrompt());
    this.renderRow = 0;
    this.writeBuffer(this.promptLength());
  }

  /**
   * Escreve o buffer quebrando manualmente nas bordas da tela, para a posição
   * final do cursor ser calculável em vez de adivinhada.
   */
  private writeBuffer(promptLength: number): void {
    const cols = this.term.cols;
    const total = promptLength + this.buffer.length;
    let written = promptLength;
    let row = 0;
    let text = '';

    for (const char of this.buffer) {
      if (written > 0 && written % cols === 0) {
        text += '\r\n';
        row++;
      }
      text += char;
      written++;
    }

    if (total > 0 && total % cols === 0) {
      text += '\r\n';
      row++;
    }

    this.term.write(text);
    this.renderRow = row;
    this.moveTo(promptLength + this.cursor);
  }

  /** Leva o cursor até um índice absoluto da linha (prompt incluído). */
  private moveTo(index: number): void {
    const cols = this.term.cols;
    const targetRow = Math.floor(index / cols);
    const targetCol = index % cols;

    if (targetRow < this.renderRow) this.term.write(`\x1b[${this.renderRow - targetRow}A`);
    else if (targetRow > this.renderRow) this.term.write(`\x1b[${targetRow - this.renderRow}B`);

    this.term.write('\r');
    if (targetCol > 0) this.term.write(`\x1b[${targetCol}C`);
    this.renderRow = targetRow;
  }
}
