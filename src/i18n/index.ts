/**
 * O locale do shell.
 *
 * É estado de módulo, e não um parâmetro carregado de função em função, porque
 * numa máquina de verdade o locale é do processo: nada em `ls` recebe o `LANG`
 * como argumento, ele consulta o ambiente. Aqui vale o mesmo — `top`, o boot e
 * o formatador de data ficam com a assinatura que tinham.
 *
 * O padrão é inglês e quem troca é o `setLocale`, chamado pelo `lang` e pela
 * restauração das preferências no boot. Idioma sem catálogo cai no inglês: uma
 * árvore de conteúdo nova em `content/` passa a existir sem exigir tradução do
 * shell no mesmo commit.
 */

import { en, type Messages } from './messages';
import { pt } from './pt';
import { ptDocs, type CommandDocs } from './docs';

const CATALOGS: Record<string, Messages> = { en, pt };
const DOCS: Record<string, Record<string, CommandDocs>> = { pt: ptDocs };

let current = 'en';

export function setLocale(lang: string): void {
  current = lang;
}

export function locale(): string {
  return current;
}

/** As mensagens do idioma atual. */
export function t(): Messages {
  return CATALOGS[current] ?? en;
}

/**
 * Número com casa decimal no separador do idioma.
 *
 * Existe porque `toFixed` é fixo em ponto e as ferramentas de verdade não são:
 * o `free -h` de um sistema em português diz `7,9Gi`, e um `7.9Gi` no meio de
 * uma tela em português é o mesmo tipo de vazamento que uma mensagem de erro
 * não traduzida.
 */
export function fixed(value: number, digits: number): string {
  const text = value.toFixed(digits);
  return t().decimal === '.' ? text : text.replace('.', t().decimal);
}

/**
 * A documentação do comando no idioma atual, com o inglês do próprio spec como
 * fallback — chave que falta vira inglês, nunca um buraco na tela.
 */
export function docs(spec: { name: string; summary: string; usage: string; man?: string }): CommandDocs {
  const translated = DOCS[current]?.[spec.name];
  if (!translated) return { summary: spec.summary, usage: spec.usage, ...(spec.man ? { man: spec.man } : {}) };
  return {
    summary: translated.summary,
    usage: translated.usage,
    ...(translated.man ?? spec.man ? { man: translated.man ?? spec.man } : {}),
  };
}

export type { Messages, CommandDocs };
export { ptDocs };
