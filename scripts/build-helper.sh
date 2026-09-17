#!/usr/bin/env bash
# Builds resources/helper/allbee-helper.exe.
# On Linux/macOS this needs the mingw-w64 cross compiler (x86_64-w64-mingw32-g++).
# On Windows, run it from an MSYS2 MinGW x64 shell (or build with the same flags using MSVC).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=resources/helper
mkdir -p "$OUT" build/helper
CXX=${CXX:-x86_64-w64-mingw32-g++}
WINDRES=${WINDRES:-x86_64-w64-mingw32-windres}
(cd native && "$WINDRES" -O coff -i allbee-helper.rc -o ../build/helper/allbee-helper.res.o)
"$CXX" -std=c++17 -O2 -Wall -Wextra -Wno-unused-parameter -municode -mwindows \
  -static -static-libgcc -static-libstdc++ \
  -o "$OUT/allbee-helper.exe" native/allbee-helper.cpp build/helper/allbee-helper.res.o \
  -lole32 -loleaut32 -luuid -lversion -luser32
x86_64-w64-mingw32-strip "$OUT/allbee-helper.exe" 2>/dev/null || true
ls -l "$OUT/allbee-helper.exe"
