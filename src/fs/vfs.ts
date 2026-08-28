import type { DirNode, FileNode, FsNode } from './types';
import { basename, dirname, normalize } from './path';

function emptyDir(mtime: number, synthetic = false): DirNode {
  return synthetic
    ? { kind: 'dir', children: {}, mtime, synthetic: true }
    : { kind: 'dir', children: {}, mtime };
}

/**
 * Filesystem simulado, inteiro em memória.
 *
 * A árvore vem do manifesto gerado no build, mas aceita escrita em runtime — é o
 * que dá sentido a `>` e `>>`. Nada persiste: recarregar a página restaura o
 * estado original.
 */
export class Vfs {
  private root: DirNode;

  constructor(root: DirNode) {
    this.root = root;
  }

  /** Substitui a árvore inteira (usado pelo comando `lang`). */
  remount(root: DirNode): void {
    this.root = root;
  }

  lookup(path: string): FsNode | null {
    const norm = normalize(path);
    if (norm === '/') return this.root;

    let node: FsNode = this.root;
    for (const part of norm.slice(1).split('/')) {
      if (node.kind !== 'dir') return null;
      const next: FsNode | undefined = node.children[part];
      if (!next) return null;
      node = next;
    }
    return node;
  }

  exists(path: string): boolean {
    return this.lookup(path) !== null;
  }

  isDir(path: string): boolean {
    return this.lookup(path)?.kind === 'dir';
  }

  isFile(path: string): boolean {
    return this.lookup(path)?.kind === 'file';
  }

  readFile(path: string): string | null {
    const node = this.lookup(path);
    return node?.kind === 'file' ? node.content : null;
  }

  /** Entradas de um diretório, ordenadas. Ocultas só saem com `all`. */
  list(path: string, all = false): { name: string; node: FsNode }[] {
    const node = this.lookup(path);
    if (node?.kind !== 'dir') return [];
    return Object.entries(node.children)
      .filter(([name]) => all || !name.startsWith('.'))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, child]) => ({ name, node: child }));
  }

  mkdirp(path: string, synthetic = false): DirNode {
    const norm = normalize(path);
    if (norm === '/') return this.root;

    let node = this.root;
    for (const part of norm.slice(1).split('/')) {
      const next: FsNode | undefined = node.children[part];
      if (next?.kind === 'dir') {
        node = next;
      } else {
        const created = emptyDir(Math.floor(Date.now() / 1000), synthetic);
        node.children[part] = created;
        node = created;
      }
    }
    return node;
  }

  /** Escreve (ou anexa) um arquivo. Cria os diretórios do caminho. */
  writeFile(path: string, content: string, append = false, synthetic = false): void {
    const parent = this.mkdirp(dirname(path), synthetic);
    const name = basename(path);
    const existing = parent.children[name];
    const previous = append && existing?.kind === 'file' ? existing.content : '';
    const file: FileNode = { kind: 'file', content: previous + content, mtime: Math.floor(Date.now() / 1000) };
    if (synthetic) file.synthetic = true;
    parent.children[name] = file;
  }

  /**
   * Apaga um nó da árvore. Devolve `false` quando não havia nada ali.
   *
   * Apagar `/` é esvaziar `/`, não sumir com ele — é o que o `rm -rf /` de
   * verdade faz, porque a raiz é um ponto de montagem e continua montada
   * depois de perder tudo que tinha dentro.
   */
  remove(path: string): boolean {
    const norm = normalize(path);
    if (norm === '/') {
      this.root.children = {};
      return true;
    }

    const parent = this.lookup(dirname(norm));
    const name = basename(norm);
    if (parent?.kind !== 'dir' || !(name in parent.children)) return false;

    delete parent.children[name];
    return true;
  }

  /** Caminhos de todos os arquivos e diretórios sob `path`, em profundidade. */
  walk(path: string, all = false): string[] {
    const out: string[] = [];
    const visit = (current: string) => {
      out.push(current);
      const node = this.lookup(current);
      if (node?.kind !== 'dir') return;
      for (const { name } of this.list(current, all)) {
        visit(current === '/' ? `/${name}` : `${current}/${name}`);
      }
    };
    visit(normalize(path));
    return out;
  }
}
