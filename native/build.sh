#!/bin/sh
# Buduje native/build/libhtpty.a (wywoływane przez `bit build` — sekcja [build] w Bit.hk).
set -e
cd "$(dirname "$0")"
mkdir -p build
${CC:-cc} ${CFLAGS:--O2 -Wall -Wextra} -c pty_shim.c -o build/pty_shim.o
${AR:-ar} rcs build/libhtpty.a build/pty_shim.o
echo "libhtpty.a gotowa: native/build/libhtpty.a"
