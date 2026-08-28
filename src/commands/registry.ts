import type { Vfs } from '../fs/vfs';
import { doomCommands } from './doom';
import { fontCommands } from './font';
import { funCommands } from './fun';
import { langCommands } from './lang';
import { navCommands } from './nav';
import { statsCommands } from './stats';
import { systemCommands } from './system';
import { textCommands } from './text';
import type { CommandRegistry, CommandSpec } from './types';

export function buildRegistry(extra: CommandSpec[] = []): CommandRegistry {
  const registry: CommandRegistry = new Map();
  const all = [
    ...navCommands,
    ...textCommands,
    ...systemCommands,
    ...statsCommands,
    ...doomCommands,
    ...fontCommands,
    ...funCommands,
    ...langCommands,
    ...extra,
  ];
  for (const spec of all) registry.set(spec.name, spec);
  return registry;
}

/**
 * Materializa `/usr/bin` a partir do que existe de fato no registro — a lista
 * nunca sai de sincronia com os comandos. Comandos ocultos ficam de fora, que é
 * a regra: se não aparece no `help --all`, não aparece em lugar nenhum.
 */
export function mountUsrBin(vfs: Vfs, registry: CommandRegistry): void {
  for (const spec of registry.values()) {
    if (spec.hidden) continue;
    vfs.writeFile(
      `/usr/bin/${spec.name}`,
      `${spec.name}: ELF 64-bit LSB executable, ARM aarch64, dynamically linked\n`,
      false,
      true,
    );
  }
}
