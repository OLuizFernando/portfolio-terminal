/**
 * Suporte a toque. No desktop este módulo não faz nada além de responder que
 * não é a vez dele.
 *
 * Duas coisas faltam num terminal aberto no celular: um jeito de emitir os
 * comandos e as teclas de controle sem soletrar tudo num teclado de vidro, e o
 * teclado do sistema não comer justamente as últimas linhas da tela — que são as
 * que interessam, porque é onde está o prompt.
 */

export interface TouchOptions {
  /** O elemento do terminal, que encolhe para caber acima do teclado. */
  frame: HTMLElement;
  /** Entrega dados ao terminal como se tivessem vindo do teclado. */
  send(data: string): void;
  /** Devolve o foco ao terminal, que é quem mantém o teclado do sistema aberto. */
  focus(): void;
}

export interface Chip {
  label: string;
  /** O que chega ao shell. Termina em `\r` quando o chip executa sozinho. */
  data: string;
  /** Vira o `title` do botão: explicação para quem toca sem saber o que é. */
  hint: string;
}

/**
 * Curta de propósito: a barra rola na horizontal se precisar, mas chip que só
 * aparece rolando não economiza toque nenhum. Os quatro comandos cobrem navegar
 * e ler, que é o site inteiro; Tab e ↑ economizam mais digitação do que qualquer
 * comando; ^C é a saída de uma linha começada por engano.
 */
export const CHIPS: Chip[] = [
  { label: 'ls', data: 'ls\r', hint: 'list this directory' },
  { label: 'cd ..', data: 'cd ..\r', hint: 'go up one directory' },
  { label: 'cat', data: 'cat ', hint: 'read a file — pick it with Tab' },
  { label: 'Tab', data: '\t', hint: 'complete what is typed' },
  { label: '↑', data: '\x1b[A', hint: 'previous command' },
  { label: 'help', data: 'help\r', hint: 'list the commands' },
  { label: '^C', data: '\x03', hint: 'abandon the line' },
];

/** Ponteiro grosso: dedo, não mouse. É o mesmo teste que o `doom` usa para recusar. */
export const isTouch = (): boolean => window.matchMedia('(pointer: coarse)').matches;

export function setupTouch(options: TouchOptions): void {
  if (!isTouch()) return;

  document.body.classList.add('touch');

  const bar = document.createElement('div');
  bar.id = 'chips';
  // Fora da árvore de acessibilidade: quem usa leitor de tela tem o terminal
  // inteiro anunciado (screenReaderMode), e a barra só repete teclas.
  bar.setAttribute('aria-hidden', 'true');

  for (const chip of CHIPS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.textContent = chip.label;
    button.title = chip.hint;
    button.tabIndex = -1;

    // No `pointerdown`, não no `click`: o clique só chega depois de o navegador
    // já ter tirado o foco do terminal, e foco perdido no celular é o teclado do
    // sistema fechando na cara de quem tocou. O preventDefault é o que impede
    // essa troca de foco acontecer.
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      options.send(chip.data);
      options.focus();
    });

    bar.appendChild(button);
  }

  document.body.appendChild(bar);

  const viewport = window.visualViewport;

  /**
   * O teclado do sistema não empurra layout nenhum: ele cobre. O `innerHeight`
   * segue relatando a tela inteira, e quem sabe quanto de fato sobrou é o
   * visualViewport. A conta dá zero nos navegadores que encolhem o layout
   * sozinhos, que é exatamente o que se quer nesse caso.
   */
  const layout = () => {
    const covered = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
    bar.style.bottom = `${covered}px`;
    // O ResizeObserver do terminal refaz o fit sozinho quando isto muda.
    options.frame.style.bottom = `${covered + bar.offsetHeight}px`;
  };

  layout();
  viewport?.addEventListener('resize', layout);
  viewport?.addEventListener('scroll', layout);
  // A rotação chega antes de o navegador ter as medidas novas.
  window.addEventListener('orientationchange', () => setTimeout(layout, 100));
}
