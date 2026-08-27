/**
 * Persistência local. Tudo aqui é conveniência do visitante e mora só no
 * navegador dele — nada disso viaja para o Pi.
 */

import { DEFAULT_FONT_SIZE } from './shell/env';

const HISTORY_KEY = 'portfolio.history';
const PREFS_KEY = 'portfolio.prefs';

export interface Prefs {
  lang: string;
  fontSize: number;
}

const DEFAULT_PREFS: Prefs = { lang: 'en', fontSize: DEFAULT_FONT_SIZE };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback; // aba anônima, storage bloqueado, JSON corrompido
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sem storage: a sessão funciona, só não lembra */
  }
}

export function loadHistory(): string[] {
  const history = read<unknown>(HISTORY_KEY, []);
  return Array.isArray(history) ? history.filter((entry): entry is string => typeof entry === 'string') : [];
}

export function saveHistory(history: string[]): void {
  write(HISTORY_KEY, history);
}

export function loadPrefs(): Prefs {
  return { ...DEFAULT_PREFS, ...read<Partial<Prefs>>(PREFS_KEY, {}) };
}

export function savePrefs(prefs: Prefs): void {
  write(PREFS_KEY, prefs);
}
