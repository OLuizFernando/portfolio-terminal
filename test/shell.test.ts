/**
 * Smoke test do shell sem navegador: monta o filesystem do manifesto e roda
 * comandos de verdade, conferindo a saída. É o que segura o parser enquanto os
 * comandos vão crescendo.
 */
import manifest from '../src/generated/manifest.json';
import { buildRegistry, mountUsrBin } from '../src/commands/registry';
import type { ShellContext } from '../src/commands/types';
import type { DirNode, Manifest } from '../src/fs/types';
import { Vfs } from '../src/fs/vfs';
import { Env } from '../src/shell/env';
import { execute } from '../src/shell/executor';
import { complete } from '../src/terminal/completion';

const langs = (manifest as unknown as Manifest).langs;
const root = structuredClone(langs['en'] as DirNode);

const vfs = new Vfs(root);
const registry = buildRegistry();
mountUsrBin(vfs, registry);

const env = new Env();

/** Registra o que o comando pediu ao terminal, para os testes conferirem. */
const terminal = { fontSize: env.fontSize, prefsSalvas: 0 };

const ctx: ShellContext = {
  vfs,
  env,
  registry,
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
