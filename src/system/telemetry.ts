/**
 * O registro dos comandos digitados, do lado do navegador.
 *
 * Guarda-se **a primeira palavra** de cada linha, e nada mais: `cd projects` vai
 * como `cd`. É o que o comando `stats` precisa, e o que sobra da linha é
 * exatamente onde alguém poderia ter escrito algo sobre si mesmo num `echo`.
 *
 * Nada aqui identifica ninguém — sem IP, sem cookie, sem identificador de
 * sessão, nem um número aleatório "anônimo", que é identificador com outro nome.
 * O lote não carrega sequer relógio: quem data é o servidor, na chegada, porque
 * o desvio do relógio de uma máquina é bom demais para reconhecê-la.
 *
 * O texto que declara tudo isso ao visitante é `/etc/privacy`, e ele tem que
 * continuar verdadeiro — se mudar o que se manda daqui, mude o arquivo junto.
 */

import { SystemOffline } from './stats';

const LOG_ENDPOINT = '/api/log';
const USAGE_ENDPOINT = '/api/usage';

/** De quantos em quantos comandos o lote sai. */
const BATCH = 10;

/** Teto do que o servidor aceita num lote. Passou disso, o começo é descartado. */
const MAX_QUEUED = 50;

const TIMEOUT_MS = 4000;

export interface Entry {
  cmd: string;
  ok: boolean;
}

export interface Usage {
  total: number;
  /** ISO da primeira linha registrada. Null enquanto não houver nenhuma. */
  since: string | null;
  countries: number;
  top: [string, number][];
  missing: [string, number][];
}

/** A primeira palavra de uma linha, ou string vazia se não houver nenhuma. */
export function firstWord(line: string): string {
  return line.trim().split(/\s+/)[0] ?? '';
}

export class Telemetry {
  private queue: Entry[] = [];
  private closed = false;

  /**
   * Anota um comando. Nunca lança: uma linha que o visitante digitou não pode
   * falhar porque a contabilidade dela falhou.
   */
  record(line: string, known: boolean): void {
    if (this.closed) return;
    const cmd = firstWord(line);
    // O teto do servidor é 32; o que passa disso não é nome de comando.
    if (cmd === '' || cmd.length > 32) return;

    this.queue.push({ cmd, ok: known });
    if (this.queue.length > MAX_QUEUED) this.queue = this.queue.slice(-MAX_QUEUED);
    if (this.queue.length >= BATCH) void this.flush();
  }

  /**
   * Manda o que estiver acumulado.
   *
   * O lote sai da fila antes de ir para a rede, e não volta se a viagem falhar:
   * telemetria perdida é telemetria perdida. Reenfileirar transformaria uma API
   * fora do ar numa fila que só cresce, e um lote antigo repetido é pior dado do
   * que lote nenhum.
   */
  async flush(): Promise<void> {
    const commands = this.queue;
    if (commands.length === 0) return;
    this.queue = [];

    try {
      await fetch(LOG_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ commands }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        // A aba pode estar fechando; sem isto o navegador cancela a requisição.
        keepalive: true,
      });
    } catch {
      /* a máquina não respondeu, e o terminal não tem nada a ver com isso */
    }
  }

  /**
   * Última chance de mandar o que sobrou, quando a aba está indo embora.
   *
   * `sendBeacon` porque nesse momento o navegador não garante mais nenhuma
   * requisição comum — nem com keepalive, se a aba for descartada da memória.
   */
  close(): void {
    if (this.closed || this.queue.length === 0) return;
    const body = JSON.stringify({ commands: this.queue });
    this.queue = [];
    try {
      navigator.sendBeacon(LOG_ENDPOINT, new Blob([body], { type: 'application/json' }));
    } catch {
      /* sem beacon, o lote se perde: é o custo de não atrapalhar o fechamento */
    }
  }

  /** Para de anotar e de mandar. Usado pelo `exit`. */
  stop(): void {
    this.close();
    this.closed = true;
  }
}

/** O agregado público, para o comando `stats`. */
export async function fetchUsage(): Promise<Usage> {
  let response: Response;
  try {
    response = await fetch(USAGE_ENDPOINT, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
  } catch (error) {
    throw new SystemOffline(error);
  }

  if (!response.ok) throw new SystemOffline(`HTTP ${response.status}`);

  try {
    return (await response.json()) as Usage;
  } catch (error) {
    throw new SystemOffline(error);
  }
}
