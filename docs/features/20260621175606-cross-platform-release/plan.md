# Plan - Cross-platform release build (GitHub Actions)

## Approach

Use the official **`tauri-apps/tauri-action`** in a 3-runner build matrix triggered by
`workflow_dispatch`. Each runner fetches its ffmpeg sidecar (extended `fetch-ffmpeg.sh`), then
`tauri-action` builds the bundle and uploads it to a single **draft GitHub Release** keyed by a
stable tag. Chosen over a hand-rolled `cargo tauri build` + manual `gh release upload` because the
action already handles per-OS bundling, `__VERSION__` substitution, and multi-job upload to one
release - reinventing that is the error-prone part.

macOS = **universal** build (`--target universal-apple-darwin`). Tauri does NOT lipo sidecars
itself, so the universal target needs a sidecar named `ffmpeg-universal-apple-darwin` /
`ffprobe-universal-apple-darwin`. CI fetches both per-arch mac sidecars and `lipo`-combines them
into the universal pair before building. Net output = exactly 3 files: 1 `.dmg`, 1 Windows
installer, 1 `.AppImage`.

## Files to create / modify

| File | Change |
| --- | --- |
| `.github/workflows/release.yml` | NEW - the manual matrix workflow (the whole feature's core). |
| `scripts/fetch-ffmpeg.sh` | MODIFY - add Linux x86_64 fetch (`fetch_linux`), wire into `all` + a `x86_64-unknown-linux-gnu` case; pin Linux sha256. |
| `README.md` | MODIFY - note the release workflow + that Linux sidecar is now fetched; document unsigned-install steps. |
| `docs/adr.md` | MODIFY - log: tauri-action + universal-mac lipo + GitHub Release delivery + Linux LGPL sidecar source. |
| `tests/` (CI lint) | Validate workflow YAML + script via `act`/`actionlint` is out of scope; rely on shellcheck-style review + a dry sidecar fetch on Linux. |

## fetch-ffmpeg.sh extension (AC-008)

Add alongside `fetch_windows` (same BtbN release, LGPL static, tar.xz instead of zip):

- New pinned vars:
  - `BTBN_LINUX="https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-06-18-14-21/ffmpeg-n8.1.2-linux64-lgpl-8.1.tar.xz"`
- New SHA256 map entries (computed + verified 2026-06-21):
  - `ffmpeg-x86_64-unknown-linux-gnu = 24c0fdc25b52e086fffda2bde3986cae4ff407b4e6420266cebbd04299dae088`
  - `ffprobe-x86_64-unknown-linux-gnu = 092bd8724eef8d07a003959906199c7dc0bcce6547b79216f0e29ddbd1bb4f44`
- `fetch_linux()`: idempotent `have` skip; `curl` the tar.xz; `tar xf`; `find` inner
  `ffmpeg-n8.1.2-linux64-lgpl-8.1` dir; `place ffmpeg-x86_64-unknown-linux-gnu inner/bin/ffmpeg`
  and same for ffprobe.
- `case` gains `x86_64-unknown-linux-gnu) fetch_linux ;;` and `all)` calls `fetch_linux`.

Triple matches Rust's Linux host triple, so `externalBin` resolves `binaries/ffmpeg ->
binaries/ffmpeg-x86_64-unknown-linux-gnu` on the Linux runner.

## release.yml structure (AC-001..AC-009)

```
name: Release
on:
  workflow_dispatch:
    inputs:
      tag:        { description: 'Release tag (e.g. v0.1.0)', required: true, default: 'v0.1.0' }
      releaseName:{ description: 'Release title', required: false }

permissions:
  contents: write          # required for tauri-action to create the Release

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: macos-latest    # universal
            args: '--target universal-apple-darwin'
            triples: 'aarch64-apple-darwin x86_64-apple-darwin'   # what fetch-ffmpeg pulls
          - platform: ubuntu-22.04
            args: ''
          - platform: windows-latest
            args: ''
    runs-on: ${{ matrix.platform }}
    steps:
      - checkout@v4
      - setup-node@v4 (node-version-file: .nvmrc)
      - dtolnay/rust-toolchain@stable
          targets: ${{ macos && 'aarch64-apple-darwin,x86_64-apple-darwin,universal-apple-darwin' || '' }}
      - (ubuntu) apt-get install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
      - npm ci
      - (mac)   scripts/fetch-ffmpeg.sh aarch64-apple-darwin && scripts/fetch-ffmpeg.sh x86_64-apple-darwin
                then lipo -> binaries/ffmpeg-universal-apple-darwin + ffprobe-universal-apple-darwin
      - (win)   scripts/fetch-ffmpeg.sh x86_64-pc-windows-msvc   (bash shell on windows runner)
      - (linux) scripts/fetch-ffmpeg.sh x86_64-unknown-linux-gnu
      - tauri-apps/tauri-action@v0   (env GITHUB_TOKEN)
          with:
            tagName: ${{ inputs.tag }}
            releaseName: ${{ inputs.releaseName || inputs.tag }}
            releaseDraft: true
            prerelease: false
            args: ${{ matrix.args }}
```

Notes:
- `lipo` step (macOS only): `lipo -create binaries/ffmpeg-aarch64-apple-darwin
  binaries/ffmpeg-x86_64-apple-darwin -output binaries/ffmpeg-universal-apple-darwin` (+ ffprobe).
- Windows runner runs the bash script via the default `bash` shell available on GH windows runners
  (Git Bash); `curl`/`unzip` are present.
- All three jobs pass the same `tagName`, so tauri-action uploads every bundle to one draft Release.
- Linux AppImage is produced by default by Tauri's Linux bundler on ubuntu-22.04 (older glibc =
  wider compatibility). `.deb` is also emitted but AppImage is the "download and run" target.

## Edge cases handled

- **Linux sidecar missing** -> fetch step runs before tauri-action; build can't reach bundling
  without it.
- **Universal sidecar** -> explicit lipo step creates the `-universal-apple-darwin` pair Tauri
  requires (it does not auto-fatten sidecars).
- **Re-run / existing tag** -> tauri-action updates the existing draft release for that tag rather
  than failing; assets are replaced.
- **Checksum drift** -> script fails closed on mismatch (existing behavior); Linux digests pinned.
- **Windows bash** -> script is POSIX-ish and already used cross-tool (`curl`/`unzip`/`find`);
  invoked with `shell: bash` on the windows job.

## Tests

This is CI/infra plumbing - no app behavior changes, so no Vitest/cargo unit tests apply.
Verification (Phase 4) is by:
1. `scripts/fetch-ffmpeg.sh x86_64-unknown-linux-gnu` placing the two Linux binaries with matching
   pinned checksums (can be partially exercised on the mac host: the download + checksum path runs;
   `place` writes a Linux ELF, harmless). At minimum, run `bash -n scripts/fetch-ffmpeg.sh` +
   `shellcheck` and a real Linux fetch confirms TC-005.
2. `actionlint` (or GitHub's own validation on push) over `release.yml` for syntax + matrix
   correctness.
3. The true end-to-end proof (TC-001..TC-004) is a manual workflow run on GitHub after merge -
   noted as a post-merge manual verification, since it needs GitHub's runners.

## Acceptance verification map

| AC | Verified by |
| --- | --- |
| AC-001 | `release.yml` `on: workflow_dispatch` only; actionlint. |
| AC-002 | matrix has macos/ubuntu/windows. |
| AC-003 | per-job fetch steps. |
| AC-004 | macOS `args: --target universal-apple-darwin` + lipo step. |
| AC-005 | windows job emits NSIS/MSI (Tauri default `targets: all`). |
| AC-006 | ubuntu job emits AppImage (Tauri default). |
| AC-007 | tauri-action `releaseDraft: true`, shared `tagName`. |
| AC-008 | `fetch-ffmpeg.sh` Linux path + pinned sha + `all`. |
| AC-009 | setup-node `.nvmrc`, rust-toolchain stable, ubuntu apt deps. |

## Risks

- **Cannot fully run CI locally:** the real cross-OS build only runs on GitHub. Mitigation:
  lint workflow + script statically, verify the Linux fetch path for real, do a manual dispatch
  after merge as the live check (documented, not silently assumed passing).
- **Universal sidecar assumption:** if Tauri's universal bundler tolerates per-arch sidecars
  instead of demanding the fat one, the lipo step is redundant (harmless). If it demands the fat
  one and lipo were skipped, the mac build fails - so lipo is the safe choice.
- **`tauri-action` major version drift (`@v0` vs `@v1`):** pin to the current major used in docs and
  confirm at write time.
- **Repo-owner vs CI token:** release creation uses the workflow's `GITHUB_TOKEN` with
  `contents: write` - no extra secret needed for an unsigned, same-repo release.
```
