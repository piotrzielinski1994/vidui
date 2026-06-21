# Cross-platform release build (GitHub Actions)

## Overview

**What:** A manually-triggered GitHub Actions workflow that builds VidUI installers for
macOS, Windows, and Linux and publishes them as downloadable assets on a GitHub Release.

**Why:** Users currently have no way to get the app without cloning the repo, installing the
Rust + Node toolchain, fetching ffmpeg sidecars, and running `tauri build`. A one-click CI
pipeline that emits ready-to-install files removes that barrier.

**Scope (this feature):**

- One workflow, `workflow_dispatch`-triggered (manual) only - no push/tag/schedule triggers.
- Three installer files, one per OS:
  - macOS: a single **universal** `.dmg` (Intel + Apple Silicon via `universal-apple-darwin`).
  - Windows: an `.exe` (NSIS) or `.msi` installer.
  - Linux: an `.AppImage`.
- Installers are **unsigned** (no Apple notarization, no Windows code-signing cert) for now.
- Output is published to a **GitHub Release** (draft), so the files have public direct-download
  links and can be deleted later by removing the release/tag or individual assets.
- Extend `scripts/fetch-ffmpeg.sh` to also fetch the **Linux x86_64** ffmpeg/ffprobe sidecar
  (currently only mac arm64/x64 + Windows are fetched), because the Tauri build fails without the
  host-triple sidecar present.

**Out of scope (YAGNI):** code-signing/notarization, auto-update feed, per-arch macOS builds,
Linux `.deb`/`.rpm`, ARM Linux/Windows, automatic release on tag, changelog generation.

## Acceptance Criteria

- AC-001: A workflow exists at `.github/workflows/release.yml` that is triggered **manually**
  (`workflow_dispatch`) and not by push/PR/tag/schedule.
- AC-002: The workflow builds on three runners - macOS, Windows, Linux - via a build matrix.
- AC-003: Each runner fetches its host-triple ffmpeg/ffprobe sidecar before building (mac builds
  fetch both arm64 + x64 for the universal target; Windows fetches win64; Linux fetches linux64).
- AC-004: The macOS job builds a **universal** binary (`--target universal-apple-darwin`) and
  produces a single `.dmg`.
- AC-005: The Windows job produces an `.exe` (NSIS) and/or `.msi` installer.
- AC-006: The Linux job produces an `.AppImage`.
- AC-007: All three installers are uploaded as assets to a single **draft** GitHub Release
  (created/updated by the workflow), with public download URLs.
- AC-008: `scripts/fetch-ffmpeg.sh` fetches the Linux `x86_64-unknown-linux-gnu` sidecar
  (SHA-256 pinned, same BtbN LGPL source as Windows) and `scripts/fetch-ffmpeg.sh all` includes it.
- AC-009: The workflow uses the repo-pinned Node version (`.nvmrc` = 24) and a Rust stable
  toolchain, and installs Linux Tauri system deps (WebKitGTK etc.) on the Linux runner.

## User Test Cases

- TC-001 (happy path - trigger): Maintainer opens GitHub -> Actions -> "Release" workflow ->
  "Run workflow" -> on completion a draft Release exists with 3 assets (`.dmg`, `.exe`/`.msi`,
  `.AppImage`). Maps to: AC-001, AC-007.
- TC-002 (happy path - macOS install): Download the `.dmg` on an Apple Silicon Mac and on an Intel
  Mac; in both, the app opens (right-click -> Open to bypass Gatekeeper, since unsigned) and plays
  a video (ffmpeg sidecar resolves). Maps to: AC-004, AC-003.
- TC-003 (happy path - Windows install): Download the installer on Windows, run it ("More info ->
  Run anyway" on SmartScreen), launch the app, play a video. Maps to: AC-005, AC-003.
- TC-004 (happy path - Linux run): Download the `.AppImage` on a glibc x86_64 distro,
  `chmod +x`, run it, play a video. Maps to: AC-006, AC-003.
- TC-005 (sidecar fetch - Linux): On a Linux host, `scripts/fetch-ffmpeg.sh` places
  `ffmpeg-x86_64-unknown-linux-gnu` and `ffprobe-x86_64-unknown-linux-gnu` in `src-tauri/binaries/`
  with matching pinned checksums. Maps to: AC-008.
- TC-006 (deletion): After a release is published, the maintainer deletes the release (and its tag);
  the public download links return 404 for future downloads. Maps to: AC-007.

## Data Model

N/A - no application data model change. The only artifacts are CI config + a shell-script
extension. ffmpeg sidecar naming follows the existing `ffmpeg-<target-triple>[.exe]` convention.

## Edge Cases

- **Missing Linux sidecar:** without AC-008 the Linux `cargo` build fails (`externalBin` can't
  resolve `binaries/ffmpeg-x86_64-unknown-linux-gnu`). Fetch must run before build on every runner.
- **Universal macOS sidecar:** `universal-apple-darwin` needs a fat (lipo'd) sidecar OR both
  per-arch sidecars present; Tauri's universal build expects the sidecar to satisfy the universal
  triple. Plan must either `lipo` the two mac binaries into a `*-universal-apple-darwin` pair or
  fetch both arch sidecars - resolved in plan.md.
- **Checksum drift:** if a pinned ffmpeg URL changes its artifact, fetch fails closed (script
  already errors on mismatch). New Linux sha256 must be pinned in the script.
- **Release already exists:** re-running the workflow must update/replace assets, not error on a
  duplicate tag (use a stable dispatch-provided tag or `softprops/action-gh-release` overwrite).
- **Gatekeeper/SmartScreen:** unsigned binaries warn on first open; documented as expected, not a
  bug.
- **Large artifacts:** ffmpeg sidecars are 60-170MB each; bundles will be large. Acceptable;
  GitHub Release assets allow up to 2GB/file.

## Dependencies

- **Tauri GitHub Action** (`tauri-apps/tauri-action`) - canonical way to build + release Tauri apps
  in CI; handles per-OS bundling and Release upload. (Confirm current usage via context7/docs.)
- **Rust toolchain action** (`dtolnay/rust-toolchain` or `actions-rust-lang`) + Rust target add for
  `universal-apple-darwin`.
- **Node setup** (`actions/setup-node`) pinned to `.nvmrc`.
- **Linux system deps:** `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`,
  `patchelf`, etc. (Tauri v2 Linux prerequisites).
- Existing `scripts/fetch-ffmpeg.sh` (extended for Linux).
- BtbN FFmpeg-Builds release `autobuild-2026-06-18-14-21` (already the Windows source) provides
  `ffmpeg-n8.1.2-linux64-lgpl-8.1.tar.xz`.

## Deletion / takedown (answer to the open question)

Yes - installers can be removed from the internet after publishing:

- Chosen path = **GitHub Release**: delete the whole release + its git tag (links die immediately),
  or delete individual assets from the release. Either kills all future downloads.
- Caveat: anyone who already downloaded a file keeps their local copy - you can stop new downloads,
  not recall existing ones.
- (Alternative not chosen: workflow artifacts auto-expire after a retention window and are
  deletable any time, but require a GitHub login to download and arrive zipped - worse end-user UX.)
