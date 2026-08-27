#!/usr/bin/env bash
#
# Baixa o que o build do DOOM precisa e que não mora neste repositório:
# o código do doomgeneric e o WAD shareware.
#
# Só é necessário para RECOMPILAR o DOOM. Os artefatos prontos vivem em
# public/doom/ e estão versionados, então o deploy no Pi não precisa de nada
# disso — nem do emscripten.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WAD_SHA256="1d7d43be501e67d927e415e0b8f3e29c3bf33075e859721816f652a526cac771"

mkdir -p "$ROOT/vendor/wad"

if [ -d "$ROOT/vendor/doomgeneric/.git" ]; then
  echo "[fetch] doomgeneric já presente"
else
  echo "[fetch] clonando doomgeneric..."
  git clone --depth 1 https://github.com/ozkl/doomgeneric.git "$ROOT/vendor/doomgeneric"
fi

WAD="$ROOT/vendor/wad/doom1.wad"
if [ -f "$WAD" ]; then
  echo "[fetch] doom1.wad já presente"
else
  # Episódio shareware do DOOM, distribuído livremente pela id desde 1993.
  echo "[fetch] baixando doom1.wad (4,2MB)..."
  curl -fsSL "https://github.com/Akbar30Bill/DOOM_wads/raw/master/doom1.wad" -o "$WAD"
fi

echo "[fetch] conferindo o WAD..."
ACTUAL="$(shasum -a 256 "$WAD" | cut -d' ' -f1)"
if [ "$ACTUAL" != "$WAD_SHA256" ]; then
  echo "  sha256 divergente!"
  echo "  esperado: $WAD_SHA256"
  echo "  obtido:   $ACTUAL"
  exit 1
fi

echo "[fetch] pronto — agora rode ./wasm/build.sh"
