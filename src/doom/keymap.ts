/** Códigos de tecla do DOOM (doomkeys.h). */
const KEY = {
  RIGHTARROW: 0xae,
  LEFTARROW: 0xac,
  UPARROW: 0xad,
  DOWNARROW: 0xaf,
  STRAFE_L: 0xa0,
  STRAFE_R: 0xa1,
  USE: 0xa2,
  FIRE: 0xa3,
  ESCAPE: 27,
  ENTER: 13,
  TAB: 9,
  BACKSPACE: 0x7f,
  RSHIFT: 0x80 + 0x36,
  RCTRL: 0x80 + 0x1d,
  RALT: 0x80 + 0x38,
  PAUSE: 0xff,
  EQUALS: 0x3d,
  MINUS: 0x2d,
} as const;

const BY_CODE: Record<string, number> = {
  ArrowLeft: KEY.LEFTARROW,
  ArrowRight: KEY.RIGHTARROW,
  ArrowUp: KEY.UPARROW,
  ArrowDown: KEY.DOWNARROW,
  Enter: KEY.ENTER,
  NumpadEnter: KEY.ENTER,
  Escape: KEY.ESCAPE,
  Tab: KEY.TAB,
  Backspace: KEY.BACKSPACE,
  Space: KEY.USE,
  ControlLeft: KEY.FIRE,
  ControlRight: KEY.FIRE,
  ShiftLeft: KEY.RSHIFT,
  ShiftRight: KEY.RSHIFT,
  AltLeft: KEY.RALT,
  AltRight: KEY.RALT,
  Pause: KEY.PAUSE,
  Equal: KEY.EQUALS,
  Minus: KEY.MINUS,
  // Teclado moderno em cima do esquema clássico: as setas viram giro, WASD anda
  // e engata a lateral, que é como quem joga hoje espera.
  KeyW: KEY.UPARROW,
  KeyS: KEY.DOWNARROW,
  KeyA: KEY.STRAFE_L,
  KeyD: KEY.STRAFE_R,
  Comma: KEY.STRAFE_L,
  Period: KEY.STRAFE_R,
};

/**
 * Traduz um evento de teclado do navegador para o código que o DOOM espera.
 * Devolve `null` para teclas que o jogo ignora.
 */
export function toDoomKey(event: KeyboardEvent): number | null {
  const mapped = BY_CODE[event.code];
  if (mapped !== undefined) return mapped;

  // F1-F12 abrem os menus do jogo.
  const fn = /^F(\d{1,2})$/.exec(event.code);
  if (fn) {
    const n = Number(fn[1]);
    if (n >= 1 && n <= 10) return 0x80 + 0x3a + n;
    if (n === 11) return 0x80 + 0x57;
    if (n === 12) return 0x80 + 0x58;
  }

  // Letras e dígitos passam direto: é o que os menus e os cheats consomem.
  if (/^Key[A-Z]$/.test(event.code)) return event.code.charCodeAt(3) + 32;
  if (/^Digit\d$/.test(event.code)) return event.code.charCodeAt(5);

  return null;
}
