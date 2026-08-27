/**
 * O /proc do filesystem simulado.
 *
 * Estes arquivos não são sintetizados: o `cat` busca o conteúdo cru do /proc de
 * verdade, pela API. Por isso eles existem na árvore com tamanho zero — que é,
 * por acaso, exatamente o que o `ls -l` mostra num /proc de verdade.
 */

import type { Vfs } from '../fs/vfs';
import { SystemOffline } from './stats';

export const PROC_DIR = '/proc';

/** Espelha a lista fechada do backend. Fora dela, o `cat` responde como o bash. */
export const PROC_FILES = ['cpuinfo', 'loadavg', 'meminfo', 'uptime', 'version'] as const;

const TIMEOUT_MS = 4000;

/** Cria as entradas vazias, para `ls /proc` e o Tab-completion funcionarem. */
export function mountProc(vfs: Vfs): void {
  for (const name of PROC_FILES) {
    vfs.writeFile(`${PROC_DIR}/${name}`, '', false, true);
  }
}

export const isProcPath = (path: string): boolean => path.startsWith(`${PROC_DIR}/`);

/** Lê um arquivo de /proc da máquina real. Lança `SystemOffline` se ela não responder. */
export async function readProc(name: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`/api/proc/${encodeURIComponent(name)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new SystemOffline(error);
  }

  // 404 aqui não é a máquina fora do ar, é arquivo que não existe. Quem chama
  // precisa distinguir para dar a mensagem certa.
  if (response.status === 404) return '';
  if (!response.ok) throw new SystemOffline(`HTTP ${response.status}`);

  try {
    return await response.text();
  } catch (error) {
    throw new SystemOffline(error);
  }
}
