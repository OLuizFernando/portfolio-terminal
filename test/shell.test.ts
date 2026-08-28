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
import { DEFAULT_FONT_SIZE, Env, TOUCH_FONT_SIZE } from '../src/shell/env';
import { CHIPS } from '../src/terminal/mobile';
import { Telemetry, firstWord } from '../src/system/telemetry';
import { report } from '../src/commands/stats';
import { neofetchBlock } from '../src/commands/system';
import { SystemClient } from '../src/system/stats';
import { execute } from '../src/shell/executor';
import { complete } from '../src/terminal/completion';
import { runBoot } from '../src/terminal/boot';
import { ptDocs } from '../src/i18n';
import art from '../src/generated/art.json';

const langs = (manifest as unknown as Manifest).langs;
const root = structuredClone(langs['en'] as DirNode);

const vfs = new Vfs(root);
const registry = buildRegistry();
mountUsrBin(vfs, registry);
mountProc(vfs);

const env = new Env();

// Espelha o que o main faz: a árvore nova não traz /usr/bin nem /proc, que são
// montados por cima. Sem refazê-los aqui, o teste não veria a regressão.
const remount = (lang: string) => {
  vfs.remount(structuredClone(langs[lang] as DirNode));
  mountUsrBin(vfs, registry);
  mountProc(vfs);
};

/** Registra o que o comando pediu ao terminal, para os testes conferirem. */
const terminal = { fontSize: env.fontSize, prefsSalvas: 0, crt: false };

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
  langs: Object.keys(langs),
  remount,
  // O `reboot` de verdade também limpa a tela e roda o boot de novo; aqui só
  // interessa o que o comando promete ao filesystem e ao cwd.
  reboot: async () => {
    remount(env.lang);
    env.cwd = env.home;
    env.oldcwd = env.home;
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
    setCrt: (on) => {
      terminal.crt = on;
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
// Dono root em tudo: é o que dá razão ao `Permission denied` do `rm`.
await check('ls -l', has('-rw-r--r--', 'root root'));
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
// A contagem vem do proprio filesystem, nunca de um literal: o teste existe para
// provar que o `ls` com saida em pipe emite uma entrada por linha em vez de
// colunas, e um numero cravado aqui passa a falhar a cada .txt que entra ou sai
// de content/ por um motivo que nao tem nada a ver com o que ele afere.
const homeEntries = vfs.list('/home/guest').length;
await check(
  'ls | wc -l',
  (o) => homeEntries > 1 && Number(o.trim()) === homeEntries,
  'ls | wc -l (conta arquivos, nao colunas)',
);
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

// Numa tela de toque o padrão é outro, e o `font reset` tem que voltar para ele,
// não para o do desktop.
env.defaultFontSize = TOUCH_FONT_SIZE;
await check('font', has('default 12'), 'font: padrão do aparelho na tela de toque');
await check('font reset', (o) => o === '12px\n' && env.fontSize === 12, 'font reset: volta ao padrão do aparelho');
env.defaultFontSize = DEFAULT_FONT_SIZE;
await check('font reset', (o) => o === '14px\n', 'font reset: volta a 14 no desktop');

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

// --- Camada 4: personalidade ----------------------------------------------

// O `sudo` não é piada: ele troca o privilégio e despacha o resto do argv.
await check('sudo', has('usage: sudo'));
await check('sudo whoami', (o) => o === 'guest\n', 'sudo despacha o comando de verdade');
await check('sudo nada', has('sudo: nada: command not found'));

// A recusa do `-rf /` é a do coreutils de verdade, e a flag que a destrava
// também. Nem o sudo passa por cima dela.
await check('rm -rf /', has('dangerous to operate recursively', '--no-preserve-root'));
await check('sudo rm -rf /', has('dangerous to operate recursively'), 'nem o root pula o failsafe');
await check('rm', has('missing operand'));

// Toda a árvore é do root — o `ls -l` diz isso — então o visitante esbarra em
// permissão antes de esbarrar em qualquer outra coisa.
await check('rm /home/guest/about.txt', has("cannot remove '/home/guest/about.txt': Permission denied"));
await check('rm /nao-existe', has('No such file or directory'));
await check('rm -f /nao-existe', (o) => o === '', 'rm -f cala sobre o que não existe');
await check('rm /etc', has("cannot remove '/etc': Is a directory"));
await check('sudo rm /RECOVERY.txt', has('No such file or directory'), 'o sobrevivente só existe depois');

// Apagar de verdade, e o arquivo voltar: o `>` já provava que a árvore aceita
// escrita, e o `rm` com privilégio é a outra metade disso.
await check('echo oi > /tmp-teste.txt', (o) => o === '' && vfs.exists('/tmp-teste.txt'));
await check(
  'sudo rm /tmp-teste.txt',
  (o) => o === '' && !vfs.exists('/tmp-teste.txt'),
  'sudo rm apaga o arquivo de verdade',
);

await check('fortune', (o) => o.trim().length > 10);
await check('fortune | wc -l', (o) => Number(o.trim()) >= 1, 'fortune | wc -l');
await check('cowsay hello', has('< hello >', '(oo)'));
await check('cowsay', has('usage: cowsay'));
await check('fortune | cowsay', has('(oo)', '||----w |'), 'fortune | cowsay');
await check('echo um | cowsay', has('< um >'));
await check('matrix | cat', has('watched, not piped'));

// O balão quebra em 40 colunas, e a moldura acompanha o texto.
count++;
const longo = (await execute('cowsay ' + 'palavra '.repeat(20), ctx)).output.split('\n');
if (!longo.every((line) => line.length <= 48) || !longo.some((line) => line.startsWith('/'))) {
  failures++;
  console.error('FAIL  cowsay quebra em 40 colunas');
} else console.log('ok    cowsay quebra em 40 colunas');

await check('crt', (o) => o === 'crt: on\n' && env.crt === true && terminal.crt === true);
await check('crt on', (o) => o === 'crt: on\n', 'crt on: idempotente');
await check('crt off', (o) => o === 'crt: off\n' && env.crt === false && terminal.crt === false);
await check('crt maybe', has('usage: crt'));

// O `rm` é reação, não comando: fica fora de toda listagem, como o ~/.secret.
await check('help --all', has('sudo', 'cowsay', 'fortune', 'matrix', 'crt', 'stats'));
await check('help --all', lacks(' rm '), 'help --all esconde o rm');
await check('ls /usr/bin', lacks('rm'), '/usr/bin esconde o rm');

// --- Telemetria -----------------------------------------------------------

count++;
if (firstWord('  cd projects/foo  ') !== 'cd' || firstWord('') !== '' || firstWord('ls') !== 'ls') {
  failures++;
  console.error('FAIL  firstWord pega a primeira palavra');
} else console.log('ok    firstWord pega a primeira palavra');

// O lote não pode carregar nada além do que o /etc/privacy promete.
{
  const enviados: unknown[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    enviados.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({}) } as Response;
  }) as unknown as typeof fetch;

  const telemetry = new Telemetry();
  for (let i = 0; i < 9; i++) telemetry.record('cd projects', true);
  const antes = enviados.length;
  telemetry.record('vimm arquivo.txt', false);
  await new Promise((resolve) => setTimeout(resolve, 10));
  globalThis.fetch = original;

  count++;
  const lote = enviados[0] as { commands: { cmd: string; ok: boolean }[] } | undefined;
  const campos = new Set(lote?.commands.flatMap((item) => Object.keys(item)) ?? []);
  const soPrimeiraPalavra = lote?.commands.every((item) => !item.cmd.includes(' ')) ?? false;
  if (
    antes !== 0 ||
    enviados.length !== 1 ||
    lote?.commands.length !== 10 ||
    !soPrimeiraPalavra ||
    campos.size !== 2 ||
    !campos.has('cmd') ||
    !campos.has('ok') ||
    lote.commands[9]?.ok !== false
  ) {
    failures++;
    console.error(`FAIL  telemetria manda lote de 10 com cmd e ok, e nada mais: ${JSON.stringify(enviados)}`);
  } else console.log('ok    telemetria manda lote de 10 com cmd e ok, e nada mais');
}

await check('stats', has('cannot reach the machine'), 'stats sem API');

// O relatório é puro: dá para conferir sem servidor nenhum.
count++;
const relatorio = report(
  {
    total: 1234,
    since: '2026-08-27T19:47:40Z',
    countries: 7,
    top: [['ls', 400], ['cat', 200]],
    missing: [['vim', 9]],
  },
  80,
  true,
).join('\n');
const vazio = report({ total: 0, since: null, countries: 0, top: [], missing: [] }, 80, true).join('\n');
if (
  !relatorio.includes('1,234 commands') ||
  !relatorio.includes('27 Aug 2026') ||
  !relatorio.includes('7 countries') ||
  !relatorio.includes('█') ||
  !relatorio.includes('vim') ||
  !vazio.includes('You are early')
) {
  failures++;
  console.error(`FAIL  stats monta o relatório\n${relatorio}`);
} else console.log('ok    stats monta o relatório');

// Sem espaço para barra, o ranking continua legível.
count++;
if (report({ total: 9, since: null, countries: 0, top: [['ls', 9]], missing: [] }, 20, true).some((l) => l.length > 20)) {
  failures++;
  console.error('FAIL  ranking cabe em tela estreita');
} else console.log('ok    ranking cabe em tela estreita');

// --- Mobile ---------------------------------------------------------------
//
// Os chips existem para substituir digitação, então o que eles digitam tem que
// existir: chip apontando para comando que saiu do registro só dá erro no
// celular de outra pessoa.
count++;
const orphans = CHIPS.filter((chip) => /^[a-z]/.test(chip.data)).filter(
  (chip) => !registry.has(chip.data.trim().split(' ')[0]!),
);
if (orphans.length > 0) {
  failures++;
  console.error(`FAIL  chip sem comando: ${orphans.map((chip) => chip.label).join(', ')}`);
} else console.log('ok    todo chip digita um comando que existe');

// A framboesa sai quando não cabe ao lado do texto: embrulhada ela não encolhe,
// só quebra no meio das palavras.
{
  const info = [
    'guest@oluizfernando',
    '-'.repeat(25),
    'Host: Raspberry Pi 5 Model B Rev 1.1',
    'Uptime: 3 days, 4 hours',
  ];
  const bare = (lines: string[]) => lines.map((line) => line.replace(/\x1b\[[0-9;]*m/g, ''));
  const wide = bare(neofetchBlock(info, 80));
  const narrow = bare(neofetchBlock(info, 44));

  count++;
  const drew = wide.some((line) => line.includes('.~~.')) && wide.every((line) => line.length <= 80);
  const dropped = narrow.every((line) => !line.includes('.~~.') && line.length <= 44);
  if (!drew || !dropped || !narrow.some((line) => line.includes('Host:'))) {
    failures++;
    console.error('FAIL  neofetch larga a arte quando a tela é estreita');
  } else console.log('ok    neofetch larga a arte quando a tela é estreita');
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

// --- lang: as árvores de conteúdo ------------------------------------------
//
// Aferido contra o manifesto, e não contra a árvore montada: aqui o assunto é o
// que existe em `content/`, e um `>` de um teste anterior teria sujado a árvore.

/** Todo caminho da árvore, com barra no fim para diretório. */
function treePaths(node: DirNode, prefix = ''): string[] {
  const out: string[] = [];
  for (const [name, child] of Object.entries(node.children)) {
    const path = `${prefix}/${name}`;
    if (child.kind === 'dir') {
      out.push(path + '/', ...treePaths(child, path));
    } else {
      out.push(path);
    }
  }
  return out.sort();
}

// O inglês é a referência por decisão do projeto (2.6: é o padrão para todos), e
// não por ser o primeiro do objeto — a ordem do manifesto não promete nada.
const baseLang = 'en';
const basePaths = treePaths(langs[baseLang] as DirNode);
const trees = Object.entries(langs)
  .filter(([lang]) => lang !== baseLang)
  .map(([lang, root]) => [lang, treePaths(root as DirNode)] as const);
const fileCount = (paths: readonly string[]) => paths.filter((path) => !path.endsWith('/')).length;

for (const [lang, paths] of trees) {
  // A quantidade primeiro, porque é o que se percebe: um arquivo escrito num
  // idioma e esquecido no outro deixa o visitante que troca de idioma sem ele.
  count++;
  if (fileCount(paths) !== fileCount(basePaths)) {
    failures++;
    console.error(
      `FAIL  content/${lang} tem ${fileCount(paths)} arquivos e content/${baseLang} tem ${fileCount(basePaths)}`,
    );
  } else {
    console.log(`ok    content/${lang} e content/${baseLang} têm ${fileCount(paths)} arquivos cada`);
  }

  // E os caminhos, porque a contagem sozinha passa com um `degree.txt` virando
  // `formacao.txt`: mesma quantidade, e o visitante que troca de idioma cai no
  // home porque o diretório em que ele estava deixou de existir (2.6).
  count++;
  const faltando = basePaths.filter((path) => !paths.includes(path));
  const sobrando = paths.filter((path) => !basePaths.includes(path));
  if (faltando.length > 0 || sobrando.length > 0) {
    failures++;
    console.error(
      `FAIL  content/${lang} não espelha content/${baseLang}` +
        (faltando.length > 0 ? `\n      falta:  ${faltando.join(', ')}` : '') +
        (sobrando.length > 0 ? `\n      sobra:  ${sobrando.join(', ')}` : ''),
    );
  } else {
    console.log(`ok    content/${lang} espelha content/${baseLang} caminho a caminho`);
  }
}

// --- lang ---------------------------------------------------------------

await check('lang', (o) => o.startsWith('en (available:') && o.includes('pt'), 'lang: atual e disponíveis');
await check('lang xx', has('no such language: xx', 'available:'), 'lang: código inexistente');
await check('lang en pt', has('usage: lang'), 'lang: argumento a mais');
await check('lang en', (o) => o === 'en\n', 'lang: trocar para o idioma atual é no-op');

env.cwd = '/home/guest/education';
await check(
  'lang pt',
  (o) => o === 'pt\n' && env.cwd === '/home/guest/education',
  'lang pt troca a árvore preservando o cwd',
);
await check('ls', has('degree.txt', 'courses.txt'), 'os nomes de arquivo são iguais nos dois idiomas');
await check('cat degree.txt', (o) => /[ãõçáéíóúê]/i.test(o), 'o conteúdo montado está em português');
await check('ls /usr/bin', has('lang', 'doom', 'ls'), '/usr/bin sobrevive à remontagem');
await check('ls /proc', has('cpuinfo', 'meminfo'), '/proc sobrevive à remontagem');

// --- lang: o shell junto com o conteúdo ------------------------------------
//
// A partir daqui a sessão está em português, e é isso que estes testes aferem:
// que o idioma vale para o shell inteiro, não só para os arquivos montados.

await check('help', has('o essencial:', 'lista tudo'), 'help fala português');
await check('man ls', has('NOME', 'USO', 'DESCRIÇÃO', 'lista o conteúdo'), 'man fala português');
await check('cat nao-existe.txt', has('Arquivo ou diretório inexistente'), 'erro de arquivo em português');
await check('ls -z', has('opção inválida'), 'erro de flag em português');
await check(
  'naoexiste',
  has('comando não encontrado', "tente 'help'"),
  'comando não encontrado em português',
);
await check('crt on', (o) => o === 'crt: ligado\n', 'crt responde em português');
await check('crt off', (o) => o === 'crt: desligado\n', 'crt off responde em português');
await check('cd /home/guest && tree', has('diretórios,', 'arquivos'), 'tree conta em português');
// A camada 3 sem máquina: o aviso de indisponibilidade também é traduzido.
await check('free', has('não consigo falar com a máquina'), 'camada 3 offline em português');

// Nome de comando e flag não se traduzem — são a interface da máquina, e nenhum
// locale do mundo mexe neles. O resumo ao lado, sim.
await check(
  'help --all',
  has('doom', 'jogar DOOM', 'fortune', 'neofetch'),
  'nome do comando em inglês, resumo em português',
);

// O boot também: ele é a primeira coisa que o visitante lê depois de um reboot.
const bootPt = await boot(20);
count++;
if (!bootPt.text.includes('Isto é um portfólio sem interface')) {
  failures++;
  console.error('FAIL  o boot fala português');
} else console.log('ok    o boot fala português');

// As linhas de kernel não: elas saem do kernel, que fala inglês em qualquer
// locale. É a mesma fronteira do nome de comando, e ela é deliberada.
count++;
if (!bootPt.text.includes('Booting Linux')) {
  failures++;
  console.error('FAIL  as linhas de kernel do boot seguem em inglês');
} else console.log('ok    as linhas de kernel do boot seguem em inglês');

// Comando novo sem tradução aparece aqui, e não na cara do visitante: o `docs`
// cai no inglês em silêncio de propósito, e o silêncio precisa de um alarme.
count++;
const semTraducao = [...registry.values()].filter((spec) => !ptDocs[spec.name]).map((spec) => spec.name);
if (semTraducao.length > 0) {
  failures++;
  console.error(`FAIL  todo comando tem tradução (falta: ${semTraducao.join(', ')})`);
} else console.log(`ok    todo comando tem tradução (${registry.size})`);

// Uma tradução incompleta não pode deixar a sessão presa num diretório morto.
env.cwd = '/home/guest/nao-existe';
await check('lang en', (o) => o === 'en\n' && env.cwd === env.home, 'lang: cwd órfão cai no home');

env.cwd = env.home;

// --- O apagamento, e a volta ----------------------------------------------
//
// Fica por último de propósito: este bloco derruba a árvore de verdade, e todo
// teste acima dele conta com ela de pé.

await check(
  'rm -rf --no-preserve-root /',
  (o) => has("cannot remove '/etc': Permission denied")(o) && vfs.exists('/home/guest'),
  'rm -rf / sem sudo não leva nada',
);

// O `/*` passa por fora do failsafe porque o glob já entregou os filhos — e pela
// mesma razão o `rm` não reclama do RECOVERY.txt, que só passou a existir depois
// de a lista estar fechada. O arquivo fica lá para quem der `ls /`.
await check(
  'sudo rm -rf /* | cat',
  (o) => !o.includes('RECOVERY') && vfs.isFile('/RECOVERY.txt') && !vfs.exists('/home'),
  'sudo rm -rf /*: apaga sem falar de arquivo que ninguém pediu',
);
await check('reboot', (o) => o === '' && vfs.exists('/home/guest'), 'reboot depois do /*');

// O que o visitante vê é o que sumiu, um caminho por linha e todos de verdade —
// silêncio aqui não passa a impressão de nada acontecendo, passa a de nada ter
// acontecido. Na pipe as linhas saem sem a cadência (armadilha 6).
{
  const antes = vfs.walk('/', true).length;
  await check(
    'sudo rm -rf --no-preserve-root / | wc -l',
    // A recusa vem junto na saída, em stderr: o número é a última linha.
    (o) => Number(o.trim().split('\n').pop()) === antes - 1,
    'sudo rm -rf /: uma linha por caminho que existia, menos a raiz',
  );
}

// Apagar de novo o que já foi apagado encontra o sobrevivente do primeiro
// apagamento — e a única resposta certa sobre ele é a recusa, nunca um
// `removed` seguido de um `cannot remove` do mesmo caminho.
await check(
  'sudo rm -rf --no-preserve-root / | wc -l',
  (o) => has("rm: cannot remove '/RECOVERY.txt'")(o) && Number(o.trim().split('\n').pop()) === 0,
  'apagar duas vezes não remove o sobrevivente',
);

await check('ls /', (o) => o.trim() === 'RECOVERY.txt', 'do apagamento sobra só o RECOVERY.txt');
await check('ls', has("cannot access '.'"), 'o home sumiu debaixo do visitante, e o shell segue de pé');
await check('help --all', has('reboot'), 'os comandos nunca estiveram no disco');
await check('cat /RECOVERY.txt', has('It let you.', 'reboot'), 'o sobrevivente diz como voltar');

await check('reboot | wc -l', has('cannot write to a pipe'));
await check(
  'reboot',
  (o) => o === '' && vfs.exists('/home/guest/about.txt') && !vfs.exists('/RECOVERY.txt'),
  'reboot: a árvore volta inteira, e o sobrevivente vai junto',
);

console.log(`\n${count - failures}/${count} passaram`);
if (failures > 0) process.exit(1);
