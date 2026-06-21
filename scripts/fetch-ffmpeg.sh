#!/usr/bin/env bash
# Download statically-linked ffmpeg + ffprobe for every supported target triple
# and place them as Tauri sidecars under src-tauri/binaries/.
#
# Tauri resolves a sidecar named "binaries/ffmpeg" to
# src-tauri/binaries/ffmpeg-<TARGET_TRIPLE>[.exe] at runtime. We place one pair
# per triple so a build/bundle on any host finds its binary.
#
# Binaries are NOT committed (src-tauri/binaries/ is gitignored). Run this once
# locally and in CI before `npm start` / `npm run tauri build`.
#
# Licensing (see docs/adr.md): macOS uses a GPLv3 static build (no off-the-shelf
# LGPL static macOS build exists); Windows and Linux use an LGPLv3 static build.
#
# Usage: scripts/fetch-ffmpeg.sh            # all triples
#        scripts/fetch-ffmpeg.sh <triple>   # just one
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="$ROOT_DIR/src-tauri/binaries"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

# Pinned, immutable artifact URLs (verified 2026-06-20).
MR_ARM="https://ffmpeg.martin-riedl.de/download/macos/arm64/1778761665_8.1.1"
MR_AMD="https://ffmpeg.martin-riedl.de/download/macos/amd64/1778768838_8.1.1"
BTBN="https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-06-18-14-21/ffmpeg-n8.1.2-win64-lgpl-8.1.zip"
BTBN_LINUX="https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-06-18-14-21/ffmpeg-n8.1.2-linux64-lgpl-8.1.tar.xz"

# SHA-256 of each placed binary. Empty string = not yet pinned: the script will
# print the computed digest and skip verification so you can paste it back here.
# A case lookup (not an associative array) so this runs on bash 3.2 - the macOS
# system bash, which is what GitHub's macOS runners execute the script with.
sha256_for() {
  case "$1" in
    ffmpeg-aarch64-apple-darwin)        echo "ef4fe121377039053b0d7bed4a9aa46e7912918f5ba6424a1dd155f4eed625b0" ;;
    ffprobe-aarch64-apple-darwin)       echo "3ec76ddd72068162294249465c36257d6c1add564f9b078e31e173837832967d" ;;
    ffmpeg-x86_64-apple-darwin)         echo "6a2c2884161d883fbb1ef21a0223475283eb4e381ee870956719f59f32daf74c" ;;
    ffprobe-x86_64-apple-darwin)        echo "cb39232c06f663e97917798ed75f7538341367401f9c180f10646193a7a29a54" ;;
    ffmpeg-x86_64-pc-windows-msvc.exe)  echo "381508c710b161c29a72ea410a3faaf269e8e90eec038f4d8034a8596daf1163" ;;
    ffprobe-x86_64-pc-windows-msvc.exe) echo "5ae7408f3b255fb939958f37e59e752750896ec4c311d3578e13ca004047f7df" ;;
    ffmpeg-x86_64-unknown-linux-gnu)    echo "24c0fdc25b52e086fffda2bde3986cae4ff407b4e6420266cebbd04299dae088" ;;
    ffprobe-x86_64-unknown-linux-gnu)   echo "092bd8724eef8d07a003959906199c7dc0bcce6547b79216f0e29ddbd1bb4f44" ;;
    *) echo "" ;;
  esac
}

sha256_of() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

# place <dest-name> <file>
place() {
  local name="$1" file="$2"
  local want
  want="$(sha256_for "$name")"
  local got
  got="$(sha256_of "$file")"
  if [ -z "$want" ] || [ "$want" = "REPLACE_ME" ]; then
    echo "  [unpinned] $name sha256=$got  (paste into SHA256 map)"
  elif [ "$want" != "$got" ]; then
    echo "  ERROR: checksum mismatch for $name" >&2
    echo "    want $want" >&2
    echo "    got  $got" >&2
    exit 1
  fi
  install -m 0755 "$file" "$BIN_DIR/$name"
  echo "  placed $name"
}

have() {
  # true if both binaries for a triple already exist (idempotent skip)
  local f1="$1" f2="$2"
  [ -f "$BIN_DIR/$f1" ] && [ -f "$BIN_DIR/$f2" ]
}

fetch_macos() {
  local triple="$1" base="$2"
  if have "ffmpeg-$triple" "ffprobe-$triple"; then
    echo "$triple: present, skipping"
    return
  fi
  echo "$triple: downloading (martin-riedl, GPLv3)"
  local d="$WORK_DIR/$triple"
  mkdir -p "$d"
  curl -fsSL "$base/ffmpeg.zip" -o "$d/ffmpeg.zip"
  curl -fsSL "$base/ffprobe.zip" -o "$d/ffprobe.zip"
  unzip -oq "$d/ffmpeg.zip" -d "$d"
  unzip -oq "$d/ffprobe.zip" -d "$d"
  place "ffmpeg-$triple" "$d/ffmpeg"
  place "ffprobe-$triple" "$d/ffprobe"
}

fetch_windows() {
  local triple="x86_64-pc-windows-msvc"
  if have "ffmpeg-$triple.exe" "ffprobe-$triple.exe"; then
    echo "$triple: present, skipping"
    return
  fi
  echo "$triple: downloading (BtbN, LGPLv3)"
  local d="$WORK_DIR/$triple"
  mkdir -p "$d"
  curl -fsSL "$BTBN" -o "$d/ffmpeg.zip"
  unzip -oq "$d/ffmpeg.zip" -d "$d"
  local inner
  inner="$(find "$d" -type d -name 'ffmpeg-n8.1.2-win64-lgpl-8.1' | head -1)"
  place "ffmpeg-$triple.exe" "$inner/bin/ffmpeg.exe"
  place "ffprobe-$triple.exe" "$inner/bin/ffprobe.exe"
}

fetch_linux() {
  local triple="x86_64-unknown-linux-gnu"
  if have "ffmpeg-$triple" "ffprobe-$triple"; then
    echo "$triple: present, skipping"
    return
  fi
  echo "$triple: downloading (BtbN, LGPLv3)"
  local d="$WORK_DIR/$triple"
  mkdir -p "$d"
  curl -fsSL "$BTBN_LINUX" -o "$d/ffmpeg.tar.xz"
  tar -xf "$d/ffmpeg.tar.xz" -C "$d"
  local inner
  inner="$(find "$d" -type d -name 'ffmpeg-n8.1.2-linux64-lgpl-8.1' | head -1)"
  place "ffmpeg-$triple" "$inner/bin/ffmpeg"
  place "ffprobe-$triple" "$inner/bin/ffprobe"
}

mkdir -p "$BIN_DIR"
TARGET="${1:-all}"
case "$TARGET" in
  aarch64-apple-darwin) fetch_macos aarch64-apple-darwin "$MR_ARM" ;;
  x86_64-apple-darwin)  fetch_macos x86_64-apple-darwin "$MR_AMD" ;;
  x86_64-pc-windows-msvc) fetch_windows ;;
  x86_64-unknown-linux-gnu) fetch_linux ;;
  all)
    fetch_macos aarch64-apple-darwin "$MR_ARM"
    fetch_macos x86_64-apple-darwin "$MR_AMD"
    fetch_windows
    fetch_linux
    ;;
  *) echo "unknown triple: $TARGET" >&2; exit 1 ;;
esac

echo "done -> $BIN_DIR"
