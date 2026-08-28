/**
 * O catálogo em português.
 *
 * A referência não é a tradução livre: é o que as ferramentas de verdade dizem
 * com `LANG=pt_BR.UTF-8`. `Arquivo ou diretório inexistente` e `opção inválida`
 * são as strings do coreutils, não invenção daqui — quem já viu um erro desses
 * num terminal de verdade tem que reconhecer este.
 */

import type { Messages } from "./messages";

/** Em português `min` não flexiona; `dia` e `hora` flexionam. */
const plural = (n: number, singular: string, pluralForm: string) => `${n} ${n === 1 ? singular : pluralForm}`;

export const pt: Messages = {
  locale: "pt-BR",
  decimal: ",",

  commandNotFound: (name) => `bash: ${name}: comando não encontrado\n`,
  tryHelp: "tente 'help' para a lista de comandos\n",
  redirectIsDir: (target) => `bash: ${target}: É um diretório\n`,
  syntaxNear: (token) => `bash: erro de sintaxe próximo do token inesperado \`${token}'`,
  syntaxUnexpectedEnd: "bash: erro de sintaxe: fim prematuro da entrada",
  syntaxUnmatched: (quote) => `bash: EOF inesperado ao procurar o \`${quote}' correspondente`,

  noSuchFile: (cmd, target) => `${cmd}: ${target}: Arquivo ou diretório inexistente\n`,
  isDirectory: (cmd, target) => `${cmd}: ${target}: É um diretório\n`,
  notDirectory: (cmd, target) => `${cmd}: ${target}: Não é um diretório\n`,
  cannotAccess: (cmd, target) => `${cmd}: não foi possível acessar '${target}': Arquivo ou diretório inexistente\n`,
  invalidOption: (cmd, flag) => `${cmd}: opção inválida -- '${flag}'\n`,
  usageLine: (text) => `uso: ${text}\n`,
  offline: (cmd) => `${cmd}: não consigo falar com a máquina\n`,

  lsTotal: (count) => `total ${count}`,
  treeCount: (dirs, files) => `${plural(dirs, "diretório", "diretórios")}, ${plural(files, "arquivo", "arquivos")}`,

  helpHeader: (all) => (all ? "todos os comandos desta máquina:" : "o essencial:"),
  helpFooter: (all) => (all ? "\n'man <comando>' explica qualquer um em detalhe." : "\n'help --all' lista tudo, 'man <comando>' explica um em detalhe."),
  manWhich: "Que página de manual você quer?\n",
  manNoEntry: (name) => `Não há entrada de manual para ${name}\n`,
  manSections: { name: "NOME", usage: "USO", description: "DESCRIÇÃO" },

  grepBadRegex: (pattern) => `grep: ${pattern}: expressão regular inválida\n`,
  badLineCount: "número de linhas inválido\n",
  wcTotal: "total",

  findMissingArgument: (predicate) => `find: falta o argumento de '${predicate}'\n`,
  findBadType: (value) => `find: argumento desconhecido para -type: ${value}\n`,
  findUnknownPredicate: (arg) => `find: predicado desconhecido '${arg}'\n`,

  fontCurrent: (size, fallback, min, max) => `${size}px (padrão ${fallback}, ${min}-${max})\n`,
  fontNotASize: (value) => `font: não é um tamanho: ${value}\n`,
  fontRange: (min, max) => `font: o tamanho tem que estar entre ${min} e ${max}\n`,

  langCurrent: (lang, available) => `${lang} (disponíveis: ${available})\n`,
  langNoSuch: (target, available) => `lang: não existe esse idioma: ${target}\ndisponíveis: ${available}\n`,

  crtState: (on) => (on ? "crt: ligado\n" : "crt: desligado\n"),
  matrixPiped: "matrix: esta aqui é para assistir, não para canalizar\n",

  doomNeedsKeyboard: "doom: precisa de teclado: setas, ctrl e espaço ao mesmo tempo.\n" + "Volte de um computador e ele estará aqui.\n",
  doomLoading: "carregando DOOM (uns 4MB, uma vez só)...\n",
  doomFontRange: (min, max) => `doom: --font tem que estar entre ${min} e ${max}\n`,
  doomUnknownOption: (arg) => `doom: opção desconhecida ${arg}\n`,
  doomFailed: (error) => `doom: falhou ao iniciar (${error})\n`,
  doomResult: (frames, seconds, fps, cols, rows, worst) => `DOOM: ${frames} quadros em ${seconds}s (${fps} fps) a ${cols}x${rows}, pior tique ${worst}ms\n`,
  doomHud: (fps, cols, rows, tick, worst, frame) => `${fps} fps  ${cols}x${rows}  tique ${tick}ms  pior ${worst}ms  quadro ${frame}KB`,

  sudoNotFound: (name) => `sudo: ${name}: comando não encontrado\n`,
  rmMissingOperand: "rm: falta operando\n",
  rmDangerous: "rm: é perigoso operar recursivamente em '/'\n" + "rm: use --no-preserve-root para passar por cima desta trava\n",
  rmCannotRemove: (path, reason) => `rm: não foi possível remover '${path}': ${reason}`,
  rmReasons: {
    permission: "Permissão negada",
    notPermitted: "Operação não permitida",
    missing: "Arquivo ou diretório inexistente",
    isDir: "É um diretório",
  },
  rmRemoved: (path, isDir) => (isDir ? `diretório removido '${path}'` : `removido '${path}'`),
  recoveryText: [
    "Parabéns. Você fez isso. Você realmente fez isso.",
    "",
    "Você rodou o rm como root contra a raiz do filesystem, na máquina de outra",
    "pessoa, numa página que você abriu talvez noventa segundos atrás, e ele",
    "rodou. Você viu uma carreira inteira passar e sumir, uma linha por vez. A",
    "formação. Os projetos. O arquivinho em que ele se apresenta a quem aparece.",
    "Tudo, porque você quis saber se ia deixar mesmo.",
    "",
    "Deixou.",
    "",
    "E aqui está você, de pé numa máquina vazia, lendo o único arquivo que",
    "sobrou. Respire fundo. Foi tudo o que você esperava que fosse?",
    "",
    "O Raspberry Pi, a propósito, não ficou sabendo de nada disso. Ele está numa",
    "mesa em São Paulo e está perfeitamente bem. O que você destruiu era uma",
    "cópia, entregue ao seu navegador no boot, sua e de mais ninguém. Você não",
    "quebrou nada além da própria aba. Isso é um alívio ou uma decepção, e só",
    "você sabe qual.",
    "",
    "Este arquivo sobreviveu porque é imutável, e é imutável porque alguém, em",
    "algum momento, previu você.",
    "",
    "    reboot        põe tudo de volta, como se você nunca tivesse estado aqui",
    "",
    "Vá em frente. Ninguém precisa saber.",
  ],

  rebootPiped: "reboot: não dá para escrever num pipe\n",
  topPiped: "top: não dá para escrever num pipe. Tente `ps`\n",

  freeHeader: ["", "total", "usado", "livre", "compart.", "buff/cache", "disponível"],
  freeRows: { mem: "Mem.:", swap: "Swap:" },
  dfHeader: (human) => ["Sist. Arq.", human ? "Tam." : "blocos-1K", "Usado", "Disp.", "Uso%", "Montado em"],
  psHeader: ["USUÁRIO", "PID", "%CPU", "%MEM", "RSS", "S", "TEMPO", "COMANDO"],

  topFirstLine: (time, up, load) => `top - ${time} no ar há ${up},  carga média: ${load}`,
  topTasks: (total, running) => `Tarefas: ${total} no total, ${running} executando`,
  topCpu: (usage, temp) => `%CPU(s): ${usage} us${temp === null ? "" : `,  temp ${temp}C`}`,
  topMem: (total, free, used, cache) => `MiB Mem.: ${total} total, ${free} livre, ${used} usado, ${cache} buff/cache`,
  topSwap: (total, free, used, available) => `MiB Swap: ${total} total, ${free} livre, ${used} usado. ${available} disp Mem.`,
  topColumns: ["PID", "USUÁRIO", "%CPU", "%MEM", "RES", "S", "TEMPO+", "COMANDO"],
  topQuit: (synthetic) => (synthetic ? "dados sintéticos, aperte q para sair" : "aperte q para sair"),

  uptimeLine: (time, up, load) => ` ${time} no ar há ${up},  carga média: ${load}\n`,
  neofetch: {
    host: "Host",
    kernel: "Kernel",
    uptime: "No ar há",
    shell: "Shell",
    shellValue: "este aqui, escrito à mão",
    terminal: "Terminal",
    cpu: "CPU",
    load: "Carga",
    temp: "Temp",
    memory: "Memória",
    disk: "Disco (/)",
    synthetic: "NOTA: dados sintéticos. Isto não é o Pi.",
  },

  statsEmpty: "Nada registrado ainda. Você chegou cedo.",
  statsTotal: (count, since, countries) => `${count} comandos digitados aqui desde ${since}` + (countries > 1 ? `, de ${countries} países` : ""),
  statsBeginning: "o começo",
  statsMissing: "não são comandos aqui, mas gente tentou:",
  statsPrivacy: "Ninguém é identificado: sem IP, sem cookie, sem sessão. Só a primeira " + "palavra de cada linha, e o país. `cat /etc/privacy` diz isso por inteiro.",

  bootOffline: ["  host        a máquina não está respondendo agora", "  status      servindo esta página do cache, ou de um nginx muito paciente"],
  bootLabels: {
    host: "host",
    kernel: "kernel",
    uptime: "no ar há",
    cpu: "cpu",
    memory: "memória",
    disk: "disco",
    note: "NOTA",
  },
  bootSynthetic: "dados sintéticos. Isto não é o Pi",
  bootWelcome: "Isto é um portfólio sem interface. Ele tem um shell no lugar.",
  bootHelpHint: "Digite 'help' para os poucos comandos que existem, ou 'ls' para só olhar em volta.",

  chips: {
    ls: "lista este diretório",
    cdUp: "sobe um diretório",
    cat: "lê um arquivo, escolha com Tab",
    tab: "completa o que está digitado",
    previous: "comando anterior",
    help: "lista os comandos",
    cancel: "abandona a linha",
  },

  months: ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"],
  weekdays: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"],
  days: (n) => plural(n, "dia", "dias"),
  hours: (n) => plural(n, "hora", "horas"),
  minutes: (n) => `${n} min`,
};
