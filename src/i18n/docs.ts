/**
 * A camada de tradução da documentação: `summary`, `usage` e `man`.
 *
 * O inglês continua junto do comando, no `CommandSpec`, porque é lá que ele é
 * escrito e revisado. Aqui fica só a sobreposição em português, num arquivo só —
 * é o mesmo arranjo de um `.po`, e pela mesma razão: tradução se revisa lendo a
 * tradução inteira de uma vez, não caçando string por trinta arquivos.
 *
 * Chave que falta cai no inglês em vez de quebrar. O `npm test` cobra a lista
 * completa, então a falta aparece no teste — não na cara do visitante.
 *
 * Nome de comando e flag não se traduzem: `ls` e `-l` são a interface da
 * máquina, e nenhum locale do mundo mexe neles. O que muda no `usage` é só o
 * nome do que o visitante põe no lugar — `<padrão>`, `[arquivo...]`.
 */

export interface CommandDocs {
  summary: string;
  usage: string;
  man?: string;
}

export const ptDocs: Record<string, CommandDocs> = {
  ls: {
    summary: "lista o conteúdo do diretório",
    usage: "ls [-a] [-l] [caminho...]",
    man: "Lista arquivos e diretórios.\n\n  -a  inclui as entradas que começam com ponto\n  -l  formato longo: permissões, tamanho, data de modificação\n\nDiretório sai com uma barra no fim.\nAs datas de modificação são reais: vêm do último commit git que tocou\ncada arquivo.",
  },
  cd: {
    summary: "troca o diretório atual",
    usage: "cd [caminho]",
    man: "Troca o diretório atual.\n\n  cd        vai para casa\n  cd -      volta para o diretório anterior\n  cd ..     sobe um nível",
  },
  pwd: { summary: "mostra o diretório atual", usage: "pwd" },
  cat: {
    summary: "mostra o conteúdo de um arquivo",
    usage: "cat [arquivo...]",
    man: "Imprime arquivos na saída. Sem argumento nenhum, ecoa o que recebe de\num pipe.",
  },
  tree: { summary: "mostra a estrutura de diretórios", usage: "tree [-a] [caminho]" },
  find: {
    summary: "procura arquivos pelo nome",
    usage: "find [caminho] [-name <padrão>] [-type f|d]",
    man: "Percorre uma árvore de diretórios e imprime o que encontra.\n\n  -name <padrão>   casa com o nome do arquivo (aceita * e ?)\n  -type f          só arquivos\n  -type d          só diretórios",
  },
  clear: { summary: "limpa a tela", usage: "clear" },
  help: {
    summary: "mostra os comandos disponíveis",
    usage: "help [--all]",
    man: "Sem argumento, mostra o punhado de comandos que basta para se virar.\n`help --all` lista todos os comandos que existem.",
  },
  man: { summary: "mostra o manual de um comando", usage: "man <comando>" },
  history: {
    summary: "mostra os comandos que você digitou",
    usage: "history",
    man: "Seu histórico vive só neste navegador e sobrevive a um reload.\nEle também é legível em ~/.bash_history.",
  },
  reboot: {
    summary: "reinicia a máquina",
    usage: "reboot",
    man: "Remonta o filesystem do zero e roda a sequência de boot de novo.\n\n" + "Tudo que você escreveu com `>` se perde, tudo que você apagou volta, e\n" + "você aterrissa no prompt, no seu diretório home.\n\n" + "Seu histórico, seu tamanho de fonte e seu idioma sobrevivem: esses moram\n" + "no navegador, não na máquina. Recarregar a página faz a mesma coisa, e\n" + "demora mais.",
  },
  exit: { summary: "encerra a sessão", usage: "exit" },

  grep: {
    summary: "filtra as linhas que casam com um padrão",
    usage: "grep [-i] [-v] [-n] [-c] <padrão> [arquivo...]",
    man: "Imprime as linhas que casam com um padrão. O padrão é uma expressão regular.\n\n  -i  ignora maiúsculas e minúsculas\n  -v  inverte: imprime as linhas que NÃO casam\n  -n  prefixa cada linha com o número dela\n  -c  imprime só quantas linhas casaram\n\nSem arquivo, lê de um pipe:\n  cat projects/*/stack.txt | grep -i react",
  },
  echo: { summary: "imprime texto", usage: "echo [-n] [texto...]" },
  head: { summary: "imprime as primeiras linhas", usage: "head [-n <quantidade>] [arquivo...]" },
  tail: { summary: "imprime as últimas linhas", usage: "tail [-n <quantidade>] [arquivo...]" },
  wc: { summary: "conta linhas, palavras e bytes", usage: "wc [-l] [-w] [-c] [arquivo...]" },
  sort: {
    summary: "ordena linhas",
    usage: "sort [-r] [-n] [-u] [arquivo...]",
    man: "Ordena linhas alfabeticamente.\n\n  -r  inverte\n  -n  compara como número\n  -u  descarta repetidas",
  },
  uniq: {
    summary: "junta linhas repetidas e vizinhas",
    usage: "uniq [-c] [-d] [arquivo...]",
    man: "Junta linhas repetidas VIZINHAS. Ordene antes, se isso importar.\n\n  -c  prefixa cada linha com quantas vezes ela apareceu\n  -d  imprime só as linhas que se repetiram",
  },

  whoami: { summary: "mostra o usuário atual", usage: "whoami", man: "Você é um convidado. Todo mundo é." },
  date: {
    summary: "mostra a data e a hora",
    usage: "date",
    man: "Mostra o seu relógio, no seu fuso, não o da máquina.",
  },
  uname: {
    summary: "mostra informação do sistema",
    usage: "uname [-a] [-s] [-r] [-v] [-m]",
    man: "Identifica a máquina.\n\n" + "  -s   nome do kernel (o padrão)\n" + "  -r   release do kernel\n" + "  -v   versão do kernel\n" + "  -m   arquitetura do hardware\n" + "  -a   tudo junto",
  },
  uptime: {
    summary: "há quanto tempo a máquina está no ar",
    usage: "uptime",
    man: "Tempo desde o último boot, e a carga média de 1, 5 e 15 minutos.\nEste é um número real de uma máquina real.",
  },
  free: {
    summary: "mostra o uso de memória",
    usage: "free [-h]",
    man: "A memória da máquina que serve esta página.\n\n  -h   tamanhos legíveis em vez de kilobytes",
  },
  df: {
    summary: "mostra o uso de disco",
    usage: "df [-h]",
    man: "Uso de disco dos filesystems reais da máquina.\n\n  -h   tamanhos legíveis em vez de blocos de 1K",
  },
  ps: {
    summary: "lista os processos em execução",
    usage: "ps [aux]",
    man: "Os processos que estão rodando na máquina agora. Ordenados por CPU,\n" + "cortados nos mais ocupados.\n\n" + "Sim, são reais. É esse o ponto do comando.",
  },
  neofetch: {
    summary: "mostra o que é esta máquina",
    usage: "neofetch",
    man: "A máquina com quem você está falando, descrita por ela mesma.\n\n" + "Todo número aqui foi lido do /proc há um instante. A temperatura é a\n" + "temperatura de verdade de uma placa na mesa da minha casa.",
  },
  top: {
    summary: "acompanha a máquina ao vivo",
    usage: "top",
    man: "Repinta a cada dois segundos com o que a máquina está fazendo, até você\n" + "apertar q. É neste comando que a metáfora para de ser metáfora.",
  },
  stats: {
    summary: "o que as pessoas digitam aqui",
    usage: "stats",
    man:
      "O que os visitantes andaram digitando neste terminal.\n\n" +
      "Dois rankings: os comandos que as pessoas rodam, e as coisas que elas\n" +
      "digitaram e não são comandos aqui, que é a lista mais honesta do que\n" +
      "está faltando.\n\n" +
      "O registro guarda a primeira palavra de cada linha e o país de onde ela\n" +
      "veio. Sem IP, sem cookie, sem identificador de sessão, nem relógio: o\n" +
      "servidor data cada linha na chegada. `cat /etc/privacy` diz por inteiro.\n\n" +
      "Os seus comandos estão aí também, inclusive este.",
  },

  doom: {
    summary: "jogar DOOM",
    usage: "doom [--fps] [--font=<px>]",
    man:
      "Roda o DOOM dentro deste terminal. Não num canvas por cima dele: os\n" +
      "quadros são desenhados como caracteres na mesma grade de texto em que\n" +
      "você está digitando.\n\n" +
      "  setas / WASD    anda e vira\n" +
      "  ctrl            atira\n" +
      "  espaço          abre portas, aciona chaves\n" +
      "  shift           corre\n" +
      "  esc             menu\n" +
      "  ctrl+c          sai de volta para o shell\n\n" +
      "  --fps           mostra taxa de quadros e tempos enquanto joga\n" +
      "  --font=<px>     tamanho do caractere no jogo, de 4 a 24\n\n" +
      "Por padrão a imagem usa a grade que o seu terminal já tem, então janela\n" +
      "maior é DOOM mais nítido. Um --font menor empacota mais caracteres e dá\n" +
      "imagem mais nítida, ao custo de mais desenho por quadro. Se começar a\n" +
      "engasgar, suba de volta. Seu shell mantém o tamanho dele de qualquer jeito.\n\n" +
      "Tudo isto roda no seu navegador, não no servidor.\n\n" +
      "Precisa de teclado, então é só no computador. Os dados do jogo têm uns\n" +
      "4MB e só são baixados na primeira vez que você pede.",
  },
  font: {
    summary: "muda o tamanho da fonte do terminal",
    usage: "font [<px> | reset]",
    man: "Muda o tamanho do texto, e lembra dele na próxima vez.\n\n" + "  font            mostra o tamanho atual\n" + "  font <px>       define, entre 8 e 32\n" + "  font reset      volta ao padrão desta tela\n\n" + "O tamanho é guardado só neste navegador. Ele não te segue para outra\n" + "máquina, e nunca chega ao servidor.\n\n" + "Este é o tamanho do texto que você está lendo. O `doom` tem o --font\n" + "dele, que só vale enquanto o jogo está rodando.",
  },

  sudo: {
    summary: "executa um comando como root",
    usage: "sudo <comando> [args...]",
    man: "Roda um comando como root, e ele roda como root mesmo.\n\n" + "Não há senha, porque não há aqui nada que valha uma. Você é convidado\n" + "numa máquina que não é sua, mas tudo o que este shell alcança é uma\n" + "cópia entregue ao seu navegador no boot. Quebre e você quebra a sua\n" + "própria aba, e o Raspberry Pi nunca fica sabendo.\n\n" + "A maioria dos comandos não liga se você usou sudo. Exatamente um liga, e\n" + "ele não está em lista nenhuma.",
  },
  rm: { summary: "remove arquivos e diretórios", usage: "rm [-rf] <caminho>..." },
  fortune: {
    summary: "imprime um aforismo ao acaso",
    usage: "fortune",
    man: "Imprime um dos epigramas de /usr/share/fortunes, ao acaso.\n\n" + "É um arquivo de verdade. Dê um `cat` nele e você tem a coleção inteira,\n" + "separada por % numa linha só, que é o formato que o fortune usa desde 1979.\n\n" + "Jogue num `cowsay`.",
  },
  cowsay: {
    summary: "uma vaca fala o que você falar",
    usage: "cowsay [texto]",
    man: "Uma vaca fala.\n\n" + "Com argumento, ela fala aquilo. Sem, ela fala o que for dado a ela:\n\n" + "  fortune | cowsay\n" + "  cat about.txt | cowsay\n\n" + "O balão quebra em 40 colunas, como o original.",
  },
  matrix: {
    summary: "siga o coelho branco",
    usage: "matrix",
    man: "Chuva digital, no terminal em que você já está.\n\n" + "Qualquer tecla para, ctrl+c inclusive. Como o `doom` e o `top`, ela roda\n" + "na tela alternativa: quando acaba, seu shell está exatamente onde você o\n" + "deixou.",
  },
  crt: {
    summary: "scanlines e brilho de fósforo",
    usage: "crt [on | off]",
    man: "Transforma o terminal no monitor que esta coisa toda finge ser:\n" + "scanlines, o vazamento suave do fósforo e os cantos escurecidos do tubo.\n\n" + "  crt        alterna\n" + "  crt on     força ligado\n" + "  crt off    força desligado\n\n" + "É lembrado neste navegador, como o tamanho da fonte. Não custa nada à\n" + "máquina do outro lado: o efeito é inteiramente na sua tela.",
  },
  lang: {
    summary: "troca o idioma",
    usage: "lang [<código>]",
    man:
      "Troca o idioma da máquina, e lembra dele na próxima vez.\n\n" +
      "  lang            mostra o idioma atual e os disponíveis\n" +
      "  lang <código>   troca para ele\n\n" +
      "Muda o conteúdo dos arquivos e também o shell: o `help`, os manuais, as\n" +
      "mensagens de erro e os rótulos do `free`, do `df` e do `top`. O que não\n" +
      "muda é nome de comando e flag. `ls` e `-l` são a interface da máquina, e\n" +
      "nenhum locale do mundo os traduz. As linhas de kernel do boot também\n" +
      "ficam: elas saem do kernel, que fala inglês em qualquer idioma.\n\n" +
      "O idioma nunca troca sozinho. Seu navegador é consultado uma vez, no\n" +
      "boot, e só para decidir se imprime uma dica de uma linha. Escolher é seu.",
  },
};
