import { runDoom, type DoomOptions } from '../doom/runtime';
import { docs, fixed, t } from '../i18n';
import { fail, ok, type CommandSpec, type Invocation } from './types';

const MIN_FONT_SIZE = 4;
const MAX_FONT_SIZE = 24;

/** DOOM precisa de teclado: setas, Ctrl e Espaço ao mesmo tempo. */
function hasKeyboard(): boolean {
  return !window.matchMedia('(pointer: coarse)').matches;
}

const doom: CommandSpec = {
  name: 'doom',
  summary: 'play DOOM',
  usage: 'doom [--fps] [--font=<px>]',
  man:
    'Runs DOOM inside this terminal. Not in a canvas on top of it — the frames\n' +
    'are drawn as characters in the same text grid you are typing into.\n\n' +
    '  arrows / WASD   move and turn\n' +
    '  ctrl            fire\n' +
    '  space           open doors, use switches\n' +
    '  shift           run\n' +
    '  esc             menu\n' +
    '  ctrl+c          quit back to the shell\n\n' +
    '  --fps           show frame rate and timings while playing\n' +
    `  --font=<px>     character size while playing, ${MIN_FONT_SIZE} to ${MAX_FONT_SIZE}\n\n` +
    'By default the picture uses the grid your terminal already has, so a bigger\n' +
    'window means a sharper DOOM. A smaller --font packs in more characters for a\n' +
    'sharper picture, at the cost of more drawing per frame — if it starts to\n' +
    'stutter, go back up. Your shell keeps its own size either way.\n\n' +
    'All of this runs in your browser, not on the server.\n\n' +
    'Needs a keyboard, so it is desktop only. The game data is about 4MB and is\n' +
    'only downloaded the first time you ask for it.',
  async run({ argv, ctx }: Invocation) {
    if (!hasKeyboard()) {
      return fail(t().doomNeedsKeyboard);
    }

    const options: DoomOptions = { showFps: false };

    for (const arg of argv.slice(1)) {
      if (arg === '--fps') {
        options.showFps = true;
        continue;
      }

      const font = /^--font=(\d+)$/.exec(arg);
      if (font) {
        const size = Number(font[1]);
        if (size < MIN_FONT_SIZE || size > MAX_FONT_SIZE) {
          return fail(t().doomFontRange(MIN_FONT_SIZE, MAX_FONT_SIZE), 2);
        }
        options.fontSize = size;
        continue;
      }

      return fail(t().doomUnknownOption(arg) + t().usageLine(docs(doom).usage), 2);
    }

    ctx.term.write(t().doomLoading);

    try {
      const result = await runDoom(ctx.term, options);
      return ok(
        t().doomResult(
          result.frames,
          fixed(result.seconds, 1),
          fixed(result.fps, 1),
          result.cols,
          result.rows,
          fixed(result.worstTickMs, 1),
        ),
      );
    } catch (error) {
      console.error('[doom]', error);
      return fail(t().doomFailed(String(error)));
    }
  },
};

export const doomCommands: CommandSpec[] = [doom];
