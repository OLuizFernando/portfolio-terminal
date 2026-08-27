export interface FileNode {
  kind: 'file';
  content: string;
  mtime: number;
  /** Arquivo sintetizado em runtime (ex.: /proc, /usr/bin) — não vem do manifesto. */
  synthetic?: boolean;
}

export interface DirNode {
  kind: 'dir';
  children: Record<string, FsNode>;
  mtime: number;
  synthetic?: boolean;
}

export type FsNode = FileNode | DirNode;

export interface Manifest {
  generatedAt: number;
  langs: Record<string, DirNode>;
}
