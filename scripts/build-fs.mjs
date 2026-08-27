/**
 * Varre content/<lang>/ e gera src/generated/manifest.json — a árvore que o
 * filesystem simulado monta em runtime.
 *
 * O mtime de cada arquivo vem da data do último commit git que o tocou. É esse
 * detalhe que faz `ls -l` mostrar datas verdadeiras. Arquivo ainda não commitado
 * cai no mtime do disco.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = path.join(root, 'content');
const outDir = path.join(root, 'src', 'generated');
const outFile = path.join(outDir, 'manifest.json');

/** Mapa path-relativo-ao-repo → epoch (segundos) do último commit. */
function gitMtimes() {
  const map = new Map();
  let log;
  try {
    log = execFileSync('git', ['log', '--pretty=format:@%ct', '--name-only', '--', 'content'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    return map; // repo sem commits ainda
  }
  let current = 0;
  for (const line of log.split('\n')) {
    if (line.startsWith('@')) current = Number(line.slice(1));
    else if (line && !map.has(line)) map.set(line, current);
  }
  return map;
}

const mtimes = gitMtimes();

function mtimeOf(absPath) {
  const rel = path.relative(root, absPath).split(path.sep).join('/');
  const fromGit = mtimes.get(rel);
  if (fromGit) return fromGit;
  return Math.floor(fs.statSync(absPath).mtimeMs / 1000);
}

function walk(dir) {
  const children = {};
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  let newest = 0;

  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.secret') continue;
    const abs = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const node = walk(abs);
      children[entry.name] = node;
      newest = Math.max(newest, node.mtime);
    } else if (entry.isFile()) {
      const content = fs.readFileSync(abs, 'utf8');
      const mtime = mtimeOf(abs);
      children[entry.name] = { kind: 'file', content, mtime };
      newest = Math.max(newest, mtime);
    }
  }

  return { kind: 'dir', children, mtime: newest || Math.floor(Date.now() / 1000) };
}

const langs = fs
  .readdirSync(contentDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

const manifest = { generatedAt: Math.floor(Date.now() / 1000), langs: {} };
for (const lang of langs) manifest.langs[lang] = walk(path.join(contentDir, lang));

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(manifest));

const count = (node) =>
  node.kind === 'file' ? 1 : Object.values(node.children).reduce((n, c) => n + count(c), 0);
const total = langs.reduce((n, l) => n + count(manifest.langs[l]), 0);
console.log(`[build-fs] ${langs.length} idioma(s), ${total} arquivo(s) → src/generated/manifest.json`);

/**
 * Arte ASCII de art/*.txt → src/generated/art.json.
 *
 * O arquivo é cru de propósito. Guardar isso num .ts obrigaria a escapar barra
 * invertida e crase a cada troca, que é exatamente o atrito que este diretório
 * existe para evitar: cola a arte, salva, pronto.
 */
const artDir = path.join(root, 'art');
const art = {};

if (fs.existsSync(artDir)) {
  for (const entry of fs.readdirSync(artDir).sort()) {
    if (!entry.endsWith('.txt')) continue;

    const lines = fs
      .readFileSync(path.join(artDir, entry), 'utf8')
      .split('\n')
      // Espaço à direita é invisível sobre fundo preto, mas engorda o bundle e
      // atrapalha a medida de largura.
      .map((line) => line.replace(/\s+$/, ''));

    // Linha em branco no começo e no fim é resíduo de copiar e colar; no meio é
    // intencional, e fica.
    while (lines.length > 0 && lines[0] === '') lines.shift();
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

    art[path.basename(entry, '.txt')] = lines;
  }
}

fs.writeFileSync(path.join(outDir, 'art.json'), JSON.stringify(art));

const shapes = Object.entries(art)
  .map(([name, lines]) => `${name} ${Math.max(0, ...lines.map((l) => [...l].length))}x${lines.length}`)
  .join(', ');
console.log(`[build-fs] arte: ${shapes || 'nenhuma'} → src/generated/art.json`);
