/**
 * Smoke test do shell sem navegador: monta o filesystem do manifesto e roda
 * comandos de verdade, conferindo a saída. É o que segura o parser enquanto os
 * comandos vão crescendo.
 */
import manifest from '../src/generated/manifest.json';
import { buildRegistry, mountUsrBin } from '../src/commands/registry';
import { mountProc } from '../src/system/proc';
import type { ShellContext } from '../src/commands/types';
import type { DirNode, Manifest } from '../src/fs/types';
import { Vfs } from '../src/fs/vfs';
import { Env } from '../src/shell/env';
import { SystemClient } from '../src/system/stats';
import { execute } from '../src/shell/executor';
import { complete } from '../src/terminal/completion';
import { runBoot } from '../src/terminal/boot';
import art from '../src/generated/art.json';

const langs = (manifest as unknown as Manifest).langs;
const root = structuredClone(langs['en'] as DirNode);

const vfs = new Vfs(root);
const registry = buildRegistry();
mountUsrBin(vfs, registry);
mountProc(vfs);

const env = new Env();

/** Registra o que o comando pediu ao terminal, para os testes conferirem. */
const terminal = { fontSize: env.fontSize, prefsSalvas: 0 };

// Sem servidor no teste headless: o fetch falha e o cliente vira SystemOffline,
// que é exatamente o cenário de "API fora do ar" que os comandos precisam tratar.
const system = new SystemClient();

const ctx: ShellContext = {
  vfs,
  env,
  registry,
  system,
  savePrefs: () => {
    terminal.prefsSalvas++;
  },
  term: {
    clear: () => {},
    write: () => {},
    writeBytes: (_data, done) => done(),
    exit: () => {},
    cellAspect: () => 0.5,
    setFontSize: (size) => {
      terminal.fontSize = size;
      return () => {
        terminal.fontSize = env.fontSize;
      };
    },
    cols: 80,
    rows: 24,
  },
};

let failures = 0;
let count = 0;

async function check(line: string, assertion: (output: string) => boolean, label = line) {
  count++;
  const { output } = await execute(line, ctx);
  if (!assertion(output)) {
    failures++;
    console.error(`FAIL  ${label}\n${output.split('\n').map((l) => '      | ' + l).join('\n')}`);
  } else {
    console.log(`ok    ${label}`);
  }
}

const has = (...needles: string[]) => (out: string) => needles.every((n) => out.includes(n));
const lacks = (...needles: string[]) => (out: string) => needles.every((n) => !out.includes(n));

await check('pwd', (o) => o === '/home/guest\n');
await check('ls', has('README.txt', 'projects/', 'experience/'));
await check('ls', lacks('.secret'));
await check('ls -a', has('.secret', './', '../'));
await check('ls -l', has('-rw-r--r--', 'guest'));
await check('cat README.txt', has('There is no interface'));
await check('cat nope.txt', has("cat: nope.txt: No such file or directory"));
await check('cd projects && pwd', (o) => o === '/home/guest/projects\n');
await check('cd ~', () => env.cwd === '/home/guest');
await check('cd nope && pwd', has('No such file or directory'), 'cd nope && pwd (nao encadeia)');
await check('cd nope || echo fallback', has('fallback'));
await check('echo one ; echo two', (o) => o === 'one\ntwo\n');

await check('cd projects', (o) => o === '' && env.cwd === '/home/guest/projects');
await check('cd ..', () => env.cwd === '/home/guest');
await check('cd /etc', () => env.cwd === '/etc');
await check('cd -', (o) => o.trim() === '~' && env.cwd === '/home/guest');
await check('cd README.txt', has('Not a directory'));

await check('tree', has('├──', '└──', 'directories,'));
await check('echo hello world', (o) => o === 'hello world\n');
await check('echo "spaced   out"', (o) => o === 'spaced   out\n');
await check("echo 'single | quoted'", (o) => o === 'single | quoted\n');

await check('cat projects/*/stack.txt', has('xterm.js'), 'glob: cat projects/*/stack.txt');
await check('cat projects/*/stack.txt | grep -i xterm', (o) => o === 'xterm.js (WebGL renderer)\n');
await check('ls | wc -l', (o) => o.trim() === '8', 'ls | wc -l (conta arquivos, nao colunas)');
await check('ls | grep projects', (o) => o === 'projects\n');
await check('cat README.txt | head -n 2 | wc -l', (o) => o.trim() === '2');
await check('echo b > /tmp/a.txt', (o) => o === '' && vfs.readFile('/tmp/a.txt') === 'b\n');
await check('echo c >> /tmp/a.txt', () => vfs.readFile('/tmp/a.txt') === 'b\nc\n');
await check('cat /tmp/a.txt | sort -r', (o) => o === 'c\nb\n');
await check('cat /tmp/a.txt | sort | uniq -c', has('1 b', '1 c'));

await check('grep -c . README.txt', (o) => Number(o.trim()) > 3);
await check('find . -name "*.txt" -type f', has('./README.txt', './projects/portfolio-terminal/stack.txt'));
await check('ls /usr/bin', has('grep', 'ls', 'tree'));
await check('cat /etc/motd', has("someone's house"));
await check('cat /var/log/career.log', has('career: boot'));

await check('help', has('the essentials', 'help --all'));
await check('help --all', has('every command', 'uniq', 'wc'));
await check('man ls', has('NAME', 'USAGE', 'DESCRIPTION', 'trailing slash'));
await check('man nope', has('No manual entry for nope'));
await check('xyz', has('bash: xyz: command not found', "try 'help'"));
await check('ls "', has('unexpected EOF'));
await check('| ls', has('syntax error'));
await check('cat README.txt >', has('syntax error'));

await check('font', has('14px', 'default 14'));
await check('font 20', (o) => o === '20px\n' && env.fontSize === 20 && terminal.fontSize === 20);
await check('font', has('20px'));
await check('font reset', (o) => o === '14px\n' && env.fontSize === 14);
await check('font 4', has('must be between 8 and 32'));
await check('font 99', has('must be between 8 and 32'));
await check('font grande', has('not a size: grande'));
await check('font 12 14', has('usage: font'));

// Duas mudanças de verdade (`font 20` e `font reset`). Ler o tamanho atual e as
// chamadas inválidas não podem gravar nada.
count++;
if (terminal.prefsSalvas !== 2) {
  failures++;
  console.error(`FAIL  font só grava quando muda (esperado 2, obtido ${terminal.prefsSalvas})`);
} else console.log('ok    font só grava as preferências quando o tamanho muda');

// --- Camada 3: a máquina de verdade -------------------------------------
//
// No teste headless não há servidor, então todo comando que depende da API cai
// no caminho de indisponibilidade. É de propósito: é esse o caminho que precisa
// continuar funcionando quando o Pi estiver fora do ar.

await check('whoami', (o) => o === 'guest\n');
await check('date', (o) => /^\w{3} \w{3} [ \d]\d \d\d:\d\d:\d\d [+-]\d{4} \d{4}\n$/.test(o));

await check('uptime', has('uptime: cannot reach the machine'), 'uptime sem API');
await check('free -h', has('free: cannot reach the machine'), 'free sem API');
await check('df', has('df: cannot reach the machine'), 'df sem API');
await check('ps', has('ps: cannot reach the machine'), 'ps sem API');
await check('neofetch', has('neofetch: cannot reach the machine'), 'neofetch sem API');
await check('uname -a', has('uname: cannot reach the machine'), 'uname sem API');
await check('cat /proc/meminfo', has('cannot reach the machine'), 'cat /proc sem API');

await check('free -z', has("free: invalid option -- 'z'"));
await check('top | cat', has('top: cannot write to a pipe'), 'top recusa pipe');

// A indisponibilidade da máquina não pode derrubar o resto da sessão.
await check('uptime ; echo alive', has('alive'), 'shell sobrevive a API fora');
await check('uptime || echo fallback', has('fallback'), 'API fora tem codigo de erro');

await check('ls /proc', has('cpuinfo', 'meminfo', 'loadavg'));
await check('ls -l /proc', has('cpuinfo'), 'ls -l /proc');
await check('help --all', has('neofetch', 'top', 'free', 'df', 'ps', 'uptime'), 'camada 3 no help --all');
await check('ls /usr/bin', has('neofetch', 'top', 'uptime'), 'camada 3 no /usr/bin');
await check('man top', has('press'), 'man top');

// --- Boot ----------------------------------------------------------------

/**
 * As larguras vêm dos arquivos, nunca de números fixos: os `art/banner*.txt`
 * existem para serem trocados, e um teste que assume 100 colunas quebra na
 * primeira troca sem que nada esteja errado.
 */
const artWidth = (lines: string[]) => Math.max(...lines.map((line) => [...line].length));
const banners = Object.values(art as Record<string, string[]>)
  .filter((lines) => lines.length > 0)
  .sort((a, b) => artWidth(b) - artWidth(a));

const widest = banners[0]!;
const narrowest = banners[banners.length - 1]!;

/** Roda o boot capturando a saída, e devolve quanto tempo levou. */
async function boot(skipAfterMs: number | null, cols = artWidth(widest)) {
  const lines: string[] = [];
  const started = Date.now();

  await runBoot({
    output: { print: (text) => lines.push(text), cols },
    system,
    onSkippable: (skip) => {
      const timer = skipAfterMs === null ? null : setTimeout(skip, skipAfterMs);
      return () => {
        if (timer) clearTimeout(timer);
      };
    },
  });

  return { text: lines.join(''), ms: Date.now() - started };
}

const full = await boot(null);
count++;
if (full.ms < 1500 || full.ms > 4500) {
  failures++;
  console.error(`FAIL  boot leva 1.5-4.5s (levou ${full.ms}ms)`);
} else console.log(`ok    boot leva ${(full.ms / 1000).toFixed(1)}s ate o prompt`);

count++;
if (!full.text.includes('Booting Linux') || !full.text.includes(widest[0]!)) {
  failures++;
  console.error('FAIL  boot imprime POST e banner');
} else console.log('ok    boot imprime POST e banner');

count++;
// Sem API no teste: o bloco de sistema tem que degradar, não sumir nem travar.
if (!full.text.includes('the machine is not answering')) {
  failures++;
  console.error('FAIL  boot degrada sem API');
} else console.log('ok    boot degrada sem API');

const skipped = await boot(50);
count++;
if (skipped.ms > 400) {
  failures++;
  console.error(`FAIL  qualquer tecla pula o boot (levou ${skipped.ms}ms)`);
} else console.log(`ok    qualquer tecla pula o boot (${skipped.ms}ms)`);

count++;
if (skipped.text !== full.text) {
  failures++;
  console.error('FAIL  pular o boot mostra o mesmo texto');
} else console.log('ok    pular o boot mostra o mesmo texto');

count++;
{
  // Uma coluna a menos do que a maior precisa já basta: o corte é "cabe inteira
  // ou não entra", sem meio-termo. Aqui ela deve cair para a arte seguinte, não
  // direto para o texto.
  const medium = (await boot(10, artWidth(widest) - 1)).text;
  if (medium.includes(widest[0]!) || !medium.includes(narrowest[0]!)) {
    failures++;
    console.error('FAIL  tela menor cai para a arte menor');
  } else console.log('ok    tela menor cai para a arte menor');
}

count++;
{
  // Abaixo da menor arte não sobra alternativa: aí sim, o nome por extenso.
  const tiny = (await boot(10, artWidth(narrowest) - 1)).text;
  if (tiny.includes(narrowest[0]!) || !tiny.includes('OLuizFernando')) {
    failures++;
    console.error('FAIL  tela minuscula troca a arte por texto');
  } else console.log('ok    tela minuscula troca a arte por texto');
}

// Tab-completion
count++;
const c1 = complete('ls proj', 7, { vfs, env, registry });
if (c1.replacement !== 'projects/') {
  failures++;
  console.error(`FAIL  complete("ls proj") -> ${JSON.stringify(c1)}`);
} else console.log('ok    complete: ls proj -> projects/');

count++;
const c2 = complete('c', 1, { vfs, env, registry });
if (!c2.candidates.includes('cat') || !c2.candidates.includes('cd') || c2.replacement !== 'c') {
  failures++;
  console.error(`FAIL  complete("c") -> ${JSON.stringify(c2)}`);
} else console.log('ok    complete: c -> [cat, cd, clear]');

count++;
const c3 = complete('cat ~/proj', 10, { vfs, env, registry });
if (c3.replacement !== '~/projects/') {
  failures++;
  console.error(`FAIL  complete("cat ~/proj") -> ${JSON.stringify(c3)}`);
} else console.log('ok    complete: cat ~/proj -> ~/projects/');

console.log(`\n${count - failures}/${count} passaram`);
if (failures > 0) process.exit(1);
