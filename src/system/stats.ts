/**
 * Cliente do /api/stats — a ponte entre o terminal simulado e a máquina real.
 *
 * O site é estático e não depende disto para existir. Quando a API não responde,
 * os comandos de sistema falham um a um e o resto continua funcionando; é por
 * isso que a indisponibilidade é um erro tipado e não uma exceção qualquer.
 */

export interface Kernel {
  release: string;
  version: string;
  machine: string;
}

export interface Cpu {
  name: string;
  cores: number;
  mhz: number;
  usagePct: number;
  tempC: number | null;
}

export interface Mem {
  totalKb: number;
  freeKb: number;
  availableKb: number;
  buffCacheKb: number;
  sharedKb: number;
  usedKb: number;
  swapTotalKb: number;
  swapFreeKb: number;
  swapUsedKb: number;
}

export interface Disk {
  device: string;
  mount: string;
  fstype: string;
  sizeKb: number;
  usedKb: number;
  availKb: number;
  usePct: number;
}

export interface Process {
  pid: number;
  user: string;
  state: string;
  cpuPct: number;
  memPct: number;
  rssKb: number;
  timeSec: number;
  comm: string;
  command: string;
}

export interface Stats {
  generatedAt: number;
  hostname: string;
  model: string;
  kernel: Kernel;
  uptimeSec: number;
  load: { avg: [number, number, number]; running: number; total: number };
  cpu: Cpu;
  mem: Mem;
  disks: Disk[];
  processes: Process[];
  /** A máquina não é real: números inventados para desenvolver fora do Pi. */
  synthetic: boolean;
}

/** A máquina não respondeu. Todo comando de camada 3 sabe lidar com isto. */
export class SystemOffline extends Error {
  constructor(readonly cause_?: unknown) {
    super('cannot reach the machine');
    this.name = 'SystemOffline';
  }
}

const ENDPOINT = '/api/stats';

/** O servidor já cacheia por 2s; pedir mais rápido que isso só gasta viagem. */
const DEFAULT_MAX_AGE_MS = 1500;

/** Link doméstico atrás de um túnel. Passou disto, a resposta não vale mais nada. */
const TIMEOUT_MS = 4000;

export class SystemClient {
  private cached: Stats | null = null;
  private cachedAt = 0;
  private inflight: Promise<Stats> | null = null;

  /** O último snapshot conhecido, sem ir à rede. Null até a primeira resposta. */
  get last(): Stats | null {
    return this.cached;
  }

  /**
   * Devolve um snapshot com no máximo `maxAgeMs` de idade, buscando se preciso.
   *
   * Chamadas concorrentes compartilham a mesma requisição: um `top` repintando e
   * um `free` digitado no mesmo instante não viram duas viagens.
   */
  async snapshot(maxAgeMs = DEFAULT_MAX_AGE_MS): Promise<Stats> {
    if (this.cached && Date.now() - this.cachedAt < maxAgeMs) return this.cached;
    if (this.inflight) return this.inflight;

    this.inflight = this.load().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async load(): Promise<Stats> {
    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: 'application/json' },
      });
    } catch (error) {
      throw new SystemOffline(error);
    }

    if (!response.ok) throw new SystemOffline(`HTTP ${response.status}`);

    let stats: Stats;
    try {
      stats = (await response.json()) as Stats;
    } catch (error) {
      throw new SystemOffline(error);
    }

    this.cached = stats;
    this.cachedAt = Date.now();
    return stats;
  }
}
