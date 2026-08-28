/*
 * Backend do doomgeneric que renderiza em ASCII, para o terminal.
 *
 * Não existe canvas nem SDL aqui. O framebuffer do DOOM é reamostrado em caixa
 * até a grade de caracteres do xterm.js, e cada célula vira um caractere de uma
 * rampa de densidade.
 *
 * Por padrão só a luminância sobrevive, que é a informação que a rampa carrega.
 * Com `dg_set_color(1)` cada célula ganha também um índice da paleta de 256 do
 * xterm, e aí a rampa passa a carregar luminância enquanto a cor carrega matiz.
 * A cor é opcional de propósito: a paleta do portfólio é branco puro, e o jogo
 * colorido é um efeito que se liga, não o padrão.
 *
 * O laço não fica aqui: o JS chama `dg_tick()` do seu próprio requestAnimationFrame
 * e lê o buffer de células. Assim o navegador nunca perde o controle do frame.
 */

#include "doomgeneric.h"
#include "doomkeys.h"
#include "i_timer.h"

#include <emscripten.h>
#include <stdint.h>
#include <string.h>

#define MAX_COLS 400
#define MAX_ROWS 200
#define KEY_QUEUE_SIZE 32

/*
 * Pior caso por célula: "ESC [ 3 8 ; 5 ; 2 5 5 m" (11) mais o caractere.
 *
 * O pior caso só acontece com cor ligada e nenhuma célula repetindo a do lado,
 * o que na prática não ocorre — mas o buffer é estático e não pode transbordar,
 * então ele é dimensionado pelo pior caso mesmo.
 */
#define CELL_CAP 12

/* Cada linha vira "ESC [ linha ; coluna H" + as células. 16 bytes cobrem o
 * cabeçalho com folga; os 64 do fim cobrem o reset de SGR do frame. */
#define ANSI_CAP ((MAX_COLS * CELL_CAP + 16) * MAX_ROWS + 64)

/* Do vazio ao cheio. Espaço de verdade no início importa: é o que faz o céu e os
 * cantos escuros sumirem em vez de virar ruído. */
static const char RAMP[] = " .,:;irsXA253hMHGS#9B&@";
#define RAMP_LEN (sizeof(RAMP) - 1)

static int g_cols = 100;
static int g_rows = 40;
static unsigned char g_cells[MAX_COLS * MAX_ROWS];
static int g_frame_pending = 0;

/* Frame já em bytes ANSI, pronto para o terminal engolir sem que o JS precise
 * montar string nenhuma. Dois buffers porque a escrita no xterm.js é assíncrona:
 * enquanto ele processa um, o próximo é montado no outro. */
/*
 * Luminância aceita por célula, com zona morta.
 *
 * Sem isso, uma variação de 1/255 na média de um bloco troca o caractere e a
 * imagem inteira cintila — feio de olhar e caro de desenhar, porque destrói o
 * redesenho parcial. A zona morta só deixa a célula mudar quando a luminância
 * se move de verdade.
 */
static unsigned char g_lum[MAX_COLS * MAX_ROWS];

/*
 * Um pouco menos que um degrau da rampa (256/23 ≈ 11). Esse é o valor certo por
 * construção: mata a oscilação em cima da fronteira entre dois caracteres sem
 * nunca segurar a célula a mais de um degrau da verdade.
 */
static int g_deadband = 8;

/* Ligada pelo `dg_set_color`. Desligada, nada de cor é quantizado nem emitido e
 * o caminho do frame é byte a byte o mesmo de antes de a cor existir. */
static int g_color_on = 0;

/* Componentes aceitos por célula, com zona morta própria — ver g_color_deadband. */
static unsigned char g_rgb[MAX_COLS * MAX_ROWS][3];

/* Índice na paleta de 256 do xterm, derivado do g_rgb já aceito. */
static unsigned char g_color[MAX_COLS * MAX_ROWS];

/*
 * Zona morta da cor, por canal.
 *
 * Mesmo problema da luminância e pela mesma razão: célula parada em cima da
 * fronteira entre dois índices troca de cor a cada frame, e cor que oscila
 * reprova a comparação do redesenho parcial — que é o que segura o framerate.
 *
 * Mais larga que a da luminância porque um degrau do cubo vale 40 níveis (95 no
 * primeiro), contra os ~11 de um degrau da rampa. Medido: numa cena parada com
 * tremor de ±6 níveis, zerar esta constante custa 10KB por quadro para não
 * mudar nada na tela; de 8 para cima o custo é zero. 24 é metade de um degrau,
 * que deixa margem sem nunca segurar a cor além do índice vizinho.
 */
static int g_color_deadband = 24;

/* Frame anterior, para redesenhar só o que mudou. */
static unsigned char g_prev[MAX_COLS * MAX_ROWS];
static unsigned char g_prev_color[MAX_COLS * MAX_ROWS];
static int g_force_full = 1;

static unsigned char g_ansi[2][ANSI_CAP];
static int g_ansi_len[2];
static int g_ansi_slot = 0;
static int g_origin_col = 1;
static int g_origin_row = 1;

static uint16_t g_key_queue[KEY_QUEUE_SIZE];
static unsigned g_key_write = 0;
static unsigned g_key_read = 0;

/* ------------------------------------------------------------------ */
/* Interface exposta ao JS                                             */
/* ------------------------------------------------------------------ */

EMSCRIPTEN_KEEPALIVE
void dg_set_grid(int cols, int rows) {
  if (cols < 1) cols = 1;
  if (rows < 1) rows = 1;
  if (cols > MAX_COLS) cols = MAX_COLS;
  if (rows > MAX_ROWS) rows = MAX_ROWS;
  g_cols = cols;
  g_rows = rows;
  memset(g_cells, ' ', sizeof(g_cells));
  memset(g_lum, 0, sizeof(g_lum));
  memset(g_rgb, 0, sizeof(g_rgb));
  memset(g_color, 0, sizeof(g_color));
  g_force_full = 1;
}

EMSCRIPTEN_KEEPALIVE
void dg_set_deadband(int value) { g_deadband = value < 0 ? 0 : (value > 64 ? 64 : value); }

/* Liga a cor. Trocar isso invalida o frame: as células não mudaram, mas o que
 * precisa ser escrito para cada uma, sim. */
EMSCRIPTEN_KEEPALIVE
void dg_set_color(int on) {
  g_color_on = on ? 1 : 0;
  g_force_full = 1;
}

/* Força o próximo frame a ser desenhado inteiro. Necessário sempre que alguém
 * escreve por cima da imagem (o HUD de fps) ou limpa a tela. */
EMSCRIPTEN_KEEPALIVE
void dg_invalidate(void) { g_force_full = 1; }

EMSCRIPTEN_KEEPALIVE
unsigned char *dg_cells(void) { return g_cells; }

/* Canto superior esquerdo do frame na tela, em coordenadas 1-based do terminal. */
EMSCRIPTEN_KEEPALIVE
void dg_set_origin(int col, int row) {
  g_origin_col = col < 1 ? 1 : col;
  g_origin_row = row < 1 ? 1 : row;
}

static int put_uint(unsigned char *dst, int value) {
  unsigned char tmp[8];
  int n = 0;
  do { tmp[n++] = (unsigned char)('0' + value % 10); value /= 10; } while (value);
  for (int i = 0; i < n; i++) dst[i] = tmp[n - 1 - i];
  return n;
}

/* Os seis níveis do cubo de cores do xterm. O salto de 0 para 95 é o dobro dos
 * outros, então a fronteira entre níveis não é uniforme e não dá para dividir. */
static const unsigned char CUBE[6] = {0, 95, 135, 175, 215, 255};

static int cube_level(int v) {
  int best = 0;
  int best_err = 1 << 30;
  for (int i = 0; i < 6; i++) {
    int d = v - CUBE[i];
    if (d < 0) d = -d;
    if (d < best_err) { best_err = d; best = i; }
  }
  return best;
}

/*
 * RGB para índice na paleta de 256 do xterm.
 *
 * Escolhe entre o cubo 6x6x6 e a rampa de cinzas pelo erro quadrático, em vez de
 * usar sempre o cubo: a rampa tem passo 10 contra os ~40 do cubo, e pedra,
 * sombra e a barra de status — boa parte da tela do DOOM — são justamente o que
 * o cubo erra mais.
 */
static unsigned char xterm256(int r, int g, int b) {
  const int lr = cube_level(r);
  const int lg = cube_level(g);
  const int lb = cube_level(b);
  int dr = r - CUBE[lr];
  int dg = g - CUBE[lg];
  int db = b - CUBE[lb];
  const int cube_err = dr * dr + dg * dg + db * db;

  /* A rampa vai de 8 a 238, de dez em dez. */
  int gi = ((r * 54 + g * 183 + b * 19) >> 8) - 8;
  gi = (gi + 5) / 10;
  if (gi < 0) gi = 0;
  if (gi > 23) gi = 23;
  const int gv = 8 + 10 * gi;
  dr = r - gv;
  dg = g - gv;
  db = b - gv;
  const int gray_err = dr * dr + dg * dg + db * db;

  if (gray_err < cube_err) return (unsigned char)(232 + gi);
  return (unsigned char)(16 + 36 * lr + 6 * lg + lb);
}

/*
 * Monta o frame em ANSI e devolve seu tamanho.
 *
 * Posicionamento absoluto por linha, em vez de CRLF: não depende de onde o
 * cursor estava e não corre risco de embrulhar quando o frame ocupa a largura
 * inteira do terminal.
 *
 * Só deve ser chamada quando o buffer anterior já foi consumido — é o JS que
 * garante isso, escrevendo um frame por vez.
 */
EMSCRIPTEN_KEEPALIVE
int dg_render(void) {
  g_ansi_slot ^= 1;
  unsigned char *out = g_ansi[g_ansi_slot];
  int n = 0;

  /*
   * Última cor já escrita no terminal nesta passada, ou -1 para "desconhecida".
   *
   * Volta a -1 depois de cada salto de cursor, e isso não é zelo: o SGR que vale
   * no destino de um salto é o que o trecho anterior deixou, não o que este
   * espera. Sem reafirmar, o primeiro trecho de cada linha sai com a cor da
   * última célula da linha anterior.
   */
  int emitted = -1;

  for (int row = 0; row < g_rows; row++) {
    const size_t base = (size_t)row * g_cols;
    const unsigned char *cur = g_cells + base;
    unsigned char *prev = g_prev + base;
    const unsigned char *col = g_color + base;
    unsigned char *pcol = g_prev_color + base;

    int first = 0;
    int last = g_cols - 1;

    /*
     * Só o trecho que mudou vai para o terminal.
     *
     * Boa parte do quadro do DOOM é estática de um tic para o outro — a barra
     * de status não muda quase nunca, o céu e as paredes distantes mudam pouco.
     * Mandar o quadro inteiro a cada frame é o que faz o parser do xterm.js
     * virar o gargalo quando a resolução sobe.
     *
     * Com cor, uma célula só está igual se o caractere E a cor estiverem: a
     * mesma parede pode trocar de tom sem trocar de densidade.
     */
    if (!g_force_full) {
      while (first <= last && cur[first] == prev[first] &&
             (!g_color_on || col[first] == pcol[first]))
        first++;
      if (first > last) continue; /* linha idêntica: nem posiciona o cursor */
      while (last > first && cur[last] == prev[last] &&
             (!g_color_on || col[last] == pcol[last]))
        last--;
    }

    const int span = last - first + 1;

    out[n++] = 0x1b;
    out[n++] = '[';
    n += put_uint(out + n, g_origin_row + row);
    out[n++] = ';';
    n += put_uint(out + n, g_origin_col + first);
    out[n++] = 'H';
    emitted = -1;

    if (!g_color_on) {
      memcpy(out + n, cur + first, (size_t)span);
      n += span;
    } else {
      /* A cor sai só na virada. Emitir por célula multiplicaria o frame por doze
       * e é o que transformaria o parser do xterm.js no gargalo. */
      for (int i = first; i <= last; i++) {
        if (col[i] != emitted) {
          emitted = col[i];
          out[n++] = 0x1b;
          out[n++] = '[';
          out[n++] = '3';
          out[n++] = '8';
          out[n++] = ';';
          out[n++] = '5';
          out[n++] = ';';
          n += put_uint(out + n, emitted);
          out[n++] = 'm';
        }
        out[n++] = cur[i];
      }
      memcpy(pcol + first, col + first, (size_t)span);
    }

    memcpy(prev + first, cur + first, (size_t)span);
  }

  /* Devolve o terminal ao estado neutro. O HUD do --fps escreve por cima da
   * imagem, e o shell reaparece na saída — nenhum dos dois pode herdar a cor da
   * última célula do frame. */
  if (g_color_on && n > 0) {
    out[n++] = 0x1b;
    out[n++] = '[';
    out[n++] = '0';
    out[n++] = 'm';
  }

  g_force_full = 0;
  g_ansi_len[g_ansi_slot] = n;
  return n;
}

EMSCRIPTEN_KEEPALIVE
unsigned char *dg_ansi(void) { return g_ansi[g_ansi_slot]; }

EMSCRIPTEN_KEEPALIVE
int dg_cols(void) { return g_cols; }

EMSCRIPTEN_KEEPALIVE
int dg_rows(void) { return g_rows; }

/* 1 se um frame novo foi desenhado desde a última chamada. */
EMSCRIPTEN_KEEPALIVE
int dg_take_frame(void) {
  int pending = g_frame_pending;
  g_frame_pending = 0;
  return pending;
}

/* `key` já vem traduzido para o código do DOOM — a tradução mora no JS, que é
 * quem conhece o teclado do visitante. */
EMSCRIPTEN_KEEPALIVE
void dg_key(int pressed, int key) {
  g_key_queue[g_key_write] = (uint16_t)(((pressed ? 1 : 0) << 8) | (key & 0xFF));
  g_key_write = (g_key_write + 1) % KEY_QUEUE_SIZE;
}

/*
 * O relógio do DOOM, em tics de 1/35s.
 *
 * O `TryRunTics` faz busy-wait até a virada do tic: se o host chamar o tick sem
 * que o relógio tenha virado, o jogo gira em falso e queima até 28ms da thread
 * principal. Expor o mesmo contador que o DOOM usa deixa o JS chamar o tick
 * exatamente uma vez por tic — sem espera, sem defasagem de fase.
 */
EMSCRIPTEN_KEEPALIVE
int dg_clock(void) { return I_GetTime(); }

EMSCRIPTEN_KEEPALIVE
void dg_start(void) {
  /* doomgeneric_Create roda a inicialização inteira e devolve o controle depois
   * de um único tick — o laço é responsabilidade de quem hospeda. */
  static char arg0[] = "doom";
  static char arg1[] = "-iwad";
  static char arg2[] = "/doom1.wad";
  static char *argv[] = {arg0, arg1, arg2, NULL};
  doomgeneric_Create(3, argv);
}

EMSCRIPTEN_KEEPALIVE
void dg_tick(void) { doomgeneric_Tick(); }

/* ------------------------------------------------------------------ */
/* Ganchos que o doomgeneric espera da plataforma                      */
/* ------------------------------------------------------------------ */

void DG_Init(void) { memset(g_cells, ' ', sizeof(g_cells)); }

void DG_DrawFrame(void) {
  const int cols = g_cols;
  const int rows = g_rows;

  for (int ry = 0; ry < rows; ry++) {
    const int y0 = ry * DOOMGENERIC_RESY / rows;
    const int y1 = (ry + 1) * DOOMGENERIC_RESY / rows;
    unsigned char *out = g_cells + ry * cols;

    for (int rx = 0; rx < cols; rx++) {
      const int x0 = rx * DOOMGENERIC_RESX / cols;
      const int x1 = (rx + 1) * DOOMGENERIC_RESX / cols;

      uint32_t sum = 0;
      uint32_t rsum = 0;
      uint32_t gsum = 0;
      uint32_t bsum = 0;
      uint32_t n = 0;

      for (int y = y0; y < y1; y++) {
        const pixel_t *line = DG_ScreenBuffer + (size_t)y * DOOMGENERIC_RESX;
        for (int x = x0; x < x1; x++) {
          const uint32_t p = line[x];
          const uint32_t r = (p >> 16) & 0xFF;
          const uint32_t g = (p >> 8) & 0xFF;
          const uint32_t b = p & 0xFF;
          /* Luma Rec.601 em inteiro: (54r + 183g + 19b) >> 8 */
          sum += (r * 54 + g * 183 + b * 19) >> 8;
          /* Três somas a mais no laço mais quente, e elas se pagam: o canal já
           * está desempacotado aqui, e refazer isso num segundo passe custaria
           * a releitura do framebuffer inteiro. */
          rsum += r;
          gsum += g;
          bsum += b;
          n++;
        }
      }

      const uint32_t lum = n ? sum / n : 0;

      if (g_color_on) {
        const size_t at = (size_t)ry * cols + rx;
        const int cr = n ? (int)(rsum / n) : 0;
        const int cg = n ? (int)(gsum / n) : 0;
        const int cb = n ? (int)(bsum / n) : 0;

        unsigned char *acc = g_rgb[at];
        int dr = cr - (int)acc[0];
        int dg = cg - (int)acc[1];
        int db = cb - (int)acc[2];
        if (dr < 0) dr = -dr;
        if (dg < 0) dg = -dg;
        if (db < 0) db = -db;

        int worst = dr > dg ? dr : dg;
        if (db > worst) worst = db;

        if (worst >= g_color_deadband) {
          acc[0] = (unsigned char)cr;
          acc[1] = (unsigned char)cg;
          acc[2] = (unsigned char)cb;
          g_color[at] = xterm256(cr, cg, cb);
        }
      }

      unsigned char *stored = &g_lum[(size_t)ry * cols + rx];
      int delta = (int)lum - (int)*stored;
      if (delta < 0) delta = -delta;
      if (delta >= g_deadband) *stored = (unsigned char)lum;

      uint32_t index = ((uint32_t)*stored * RAMP_LEN) >> 8;
      if (index >= RAMP_LEN) index = RAMP_LEN - 1;
      out[rx] = (unsigned char)RAMP[index];
    }
  }

  g_frame_pending = 1;
}

/* Quem controla o ritmo é o requestAnimationFrame do navegador. Dormir aqui só
 * congelaria a aba. */
void DG_SleepMs(uint32_t ms) { (void)ms; }

uint32_t DG_GetTicksMs(void) { return (uint32_t)emscripten_get_now(); }

int DG_GetKey(int *pressed, unsigned char *key) {
  if (g_key_read == g_key_write) return 0;

  const uint16_t data = g_key_queue[g_key_read];
  g_key_read = (g_key_read + 1) % KEY_QUEUE_SIZE;

  *pressed = data >> 8;
  *key = data & 0xFF;
  return 1;
}

void DG_SetWindowTitle(const char *title) { (void)title; }

int main(int argc, char **argv) {
  (void)argc;
  (void)argv;
  /* O JS decide quando começar: o `doom` só existe quando alguém digita `doom`. */
  return 0;
}
