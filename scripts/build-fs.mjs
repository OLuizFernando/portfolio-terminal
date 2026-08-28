/**
 * Varre content/<lang>/ e gera src/generated/manifest.json — a árvore que o
 * filesystem simulado monta em runtime.
 *
 * O mtime de cada arquivo vem da data do último commit git que o tocou. É esse
 * detalhe que faz `ls -l` mostrar datas verdadeiras. Arquivo ainda não commitado
 * cai no mtime do disco.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

/**
 * Dois arquivos da árvore não são escritos à mão: eles descrevem o build que os
 * gerou, e escrever isso à mão seria escrever mentira com data de validade.
 *
 * São iguais nos dois idiomas de propósito. `/etc/os-release` é formato de
 * máquina, e o changelog é a mensagem de commit — que este repositório escreve
 * em inglês, traduzido ou não o site.
 */
const REPO_URL = 'https://github.com/OLuizFernando/portfolio-terminal';
const SITE_URL = 'https://oluizfernando.com.br';

/** Um commit por linha: hash curto, epoch e assunto. Vazio fora de um checkout. */
function gitLog() {
  try {
    const raw = execFileSync('git', ['log', '--no-merges', '--pretty=format:%h\x1f%ct\x1f%s'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 32 * 1024 * 1024,
    });
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, at, subject] = line.split('\x1f');
        return { hash, at: Number(at), subject };
      });
  } catch {
    return [];
  }
}

const day = (epoch) => new Date(epoch * 1000).toISOString().slice(0, 10);

function osRelease(commits) {
  const head = commits[0];
  const version = `${day(head.at).replace(/-/g, '.')} (${head.hash})`;
  return [
    'NAME="portfolio"',
    'ID=portfolio',
    `PRETTY_NAME="portfolio ${version}"`,
    `VERSION="${version}"`,
    `VERSION_ID=${day(head.at).replace(/-/g, '.')}`,
    `BUILD_ID=${head.hash}`,
    `HOME_URL="${SITE_URL}"`,
    `SOURCE_URL="${REPO_URL}"`,
    'ANSI_COLOR="0;32"',
    '',
  ].join('\n');
}

function changelog(commits) {
  const lines = [
    'portfolio -- what changed, from the git history of the machine you are on.',
    '',
    `Generated at build time from ${REPO_URL}.`,
    '',
  ];

  let previous = '';
  for (const { hash, at, subject } of commits) {
    const date = day(at);
    if (date !== previous) {
      if (previous !== '') lines.push('');
      lines.push(date);
      previous = date;
    }
    lines.push(`  ${hash}  ${subject}`);
  }

  return lines.join('\n') + '\n';
}

/**
 * Enfia um arquivo gerado na árvore, criando os diretórios que faltarem e
 * empurrando o mtime dos pais — sem isso o `ls -l` de um diretório novo mostra
 * a data em que o walk não achou nada.
 */
function place(tree, filePath, content, mtime) {
  const parts = filePath.split('/').filter(Boolean);
  const name = parts.pop();
  let node = tree;

  for (const part of parts) {
    if (!node.children[part]) node.children[part] = { kind: 'dir', children: {}, mtime };
    node.mtime = Math.max(node.mtime, mtime);
    node = node.children[part];
  }

  node.mtime = Math.max(node.mtime, mtime);
  node.children[name] = { kind: 'file', content, mtime };
  tree.mtime = Math.max(tree.mtime, mtime);
}

const commits = gitLog();
if (commits.length > 0) {
  const mtime = commits[0].at;
  for (const lang of langs) {
    place(manifest.langs[lang], '/etc/os-release', osRelease(commits), mtime);
    place(manifest.langs[lang], '/usr/share/doc/portfolio/CHANGELOG', changelog(commits), mtime);
  }
  console.log(`[build-fs] gerados: /etc/os-release e o CHANGELOG de ${commits.length} commit(s)`);
} else {
  // Fora de um checkout do git não há o que descrever, e um arquivo com data
  // inventada seria pior do que arquivo nenhum.
  console.log('[build-fs] sem git: /etc/os-release e o CHANGELOG ficam de fora');
}

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

/**
 * Hash dos artefatos do DOOM → src/generated/doom.json.
 *
 * Os três arquivos de public/doom/ têm nome fixo e conteúdo que muda a cada
 * recompilação do wasm. Sem nada que diferencie as versões, o cache de 30 dias
 * do nginx e do Cloudflare serve o loader velho junto do wasm novo — e como o
 * Cloudflare cacheia .js mas não .wasm, o par chega desencontrado e o jogo
 * morre num export que existe no wasm e não existe no loader.
 *
 * O hash entra na query das URLs em src/doom/runtime.ts, então a URL muda com o
 * conteúdo e os 30 dias passam a estar corretos. É lido dos bytes já versionados
 * em public/doom/, não da compilação: quem não tem emsdk também gera isto.
 */
const doomDir = path.join(root, 'public', 'doom');
const doomFiles = ['doom.js', 'doom.wasm', 'doom.data'];
const digest = createHash('sha256');

for (const name of doomFiles) {
  const file = path.join(doomDir, name);
  // Artefato ausente não é erro: dá para desenvolver o resto do site sem ter
  // compilado o DOOM. O nome entra no hash de qualquer jeito, para que passar a
  // ter o arquivo já mude a versão.
  digest.update(name);
  if (fs.existsSync(file)) digest.update(fs.readFileSync(file));
}

const doomVersion = digest.digest('hex').slice(0, 12);
fs.writeFileSync(path.join(outDir, 'doom.json'), JSON.stringify({ version: doomVersion }));
console.log(`[build-fs] doom: ${doomVersion} → src/generated/doom.json`);
