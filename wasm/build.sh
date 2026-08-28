#!/usr/bin/env bash
#
# Compila o doomgeneric para WebAssembly com o backend ASCII deste repositório.
#
# Saída em public/doom/ (doom.js, doom.wasm, doom.data). Fica fora do bundle do
# Vite de propósito: o DOOM é carregado sob demanda, só quando alguém digita
# `doom`, e o cache de borda do Cloudflare é quem absorve o peso.
#
# Requer o emsdk. Se `emcc` não estiver no PATH, o script tenta ~/.emsdk.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DG="$ROOT/vendor/doomgeneric/doomgeneric"
WAD="$ROOT/vendor/wad/doom1.wad"
OUT="$ROOT/public/doom"
BUILD="$ROOT/wasm/build"

if ! command -v emcc >/dev/null 2>&1; then
  # shellcheck disable=SC1091
  [ -f "$HOME/.emsdk/emsdk_env.sh" ] && source "$HOME/.emsdk/emsdk_env.sh" >/dev/null 2>&1
fi
command -v emcc >/dev/null 2>&1 || { echo "emcc não encontrado: instale o emsdk"; exit 1; }
[ -f "$WAD" ] || { echo "WAD ausente em $WAD"; exit 1; }

# A grade do terminal é decidida em runtime; o DOOM renderiza no seu tamanho
# nativo e a reamostragem acontece no nosso backend. 320x200 evita que o
# doomgeneric faça um upscale que jogaríamos fora logo em seguida.
RES="-DDOOMGENERIC_RESX=320 -DDOOMGENERIC_RESY=200"

# Mesma lista de objetos do build linuxvt (sem som, sem SDL), trocando o backend.
SOURCES=(
  dummy am_map doomdef doomstat dstrings d_event d_items d_iwad d_loop d_main
  d_mode d_net f_finale f_wipe g_game hu_lib hu_stuff info i_cdmus i_endoom
  i_joystick i_scale i_sound i_system i_timer memio m_argv m_bbox m_cheat
  m_config m_controls m_fixed m_menu m_misc m_random p_ceilng p_doors p_enemy
  p_floor p_inter p_lights p_map p_maputl p_mobj p_plats p_pspr p_saveg p_setup
  p_sight p_spec p_switch p_telept p_tick p_user r_bsp r_data r_draw r_main
  r_plane r_segs r_sky r_things sha1 sounds statdump st_lib st_stuff s_sound
  tables v_video wi_stuff w_checksum w_file w_main w_wad z_zone w_file_stdc
  i_input i_video doomgeneric mus2mid
)

CFLAGS=(-O3 -DNORMALUNIX -DLINUX -D_DEFAULT_SOURCE -I"$DG" -w $RES)

mkdir -p "$BUILD" "$OUT"

echo "[doom] compilando $(( ${#SOURCES[@]} + 1 )) arquivos..."
OBJS=()
for src in "${SOURCES[@]}"; do
  obj="$BUILD/$src.o"
  if [ ! -f "$obj" ] || [ "$DG/$src.c" -nt "$obj" ]; then
    emcc "${CFLAGS[@]}" -c "$DG/$src.c" -o "$obj"
  fi
  OBJS+=("$obj")
done

# O backend é nosso e muda com frequência: sempre recompila.
emcc "${CFLAGS[@]}" -c "$ROOT/wasm/doomgeneric_wasm.c" -o "$BUILD/doomgeneric_wasm.o"
OBJS+=("$BUILD/doomgeneric_wasm.o")

EXPORTS='["_main","_dg_start","_dg_tick","_dg_set_grid","_dg_cells","_dg_cols","_dg_rows","_dg_take_frame","_dg_key","_dg_clock","_dg_render","_dg_ansi","_dg_set_origin","_dg_invalidate","_dg_set_deadband","_dg_set_color"]'

echo "[doom] linkando..."
emcc "${CFLAGS[@]}" "${OBJS[@]}" -o "$OUT/doom.js" \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s EXPORT_NAME=createDoom \
  -s ENVIRONMENT=web \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=64MB \
  -s EXIT_RUNTIME=0 \
  -s INVOKE_RUN=0 \
  -s ASSERTIONS=0 \
  -s EXPORTED_FUNCTIONS="$EXPORTS" \
  -s EXPORTED_RUNTIME_METHODS='["HEAPU8","callMain"]' \
  --preload-file "$WAD"@/doom1.wad

echo "[doom] pronto:"
ls -lh "$OUT"/doom.* | awk '{ print "  " $NF " " $5 }'
