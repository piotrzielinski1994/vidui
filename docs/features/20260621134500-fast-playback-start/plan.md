# Plan: Fast playback start (FR-13)

## Task breakdown

1. **AC-003 - version the cache namespace** (`cache_path`): push a `v2` segment into the
   transcode dir (`vidui-transcode/v2/<hash>.mp4`). Stale fragmented files live under the old
   unversioned dir and are never matched again. Test first.

2. **AC-002 / AC-005 - single probe + pure parser** (`parse_probe_json`, `probe_media`):
   - Add `ProbeResult { container, vcodec, acodec }`.
   - `parse_probe_json(&str) -> ProbeResult`: pure, parses one `ffprobe -of json` payload
     (`format.format_name`, first video stream `codec_name`, first audio stream `codec_name`).
     No video stream -> `vcodec = ""` (caller errors). Bad/empty input -> empty result.
   - `probe_media(app, path) -> ProbeResult`: one `ffprobe` spawn
     (`-show_entries format=format_name:stream=codec_name,codec_type -of json`), feeds
     `parse_probe_json`. Replaces `probe_stream` x2 + `probe_container`.

3. **AC-001 - cache-before-probe** (`prepare_media`): check `target.exists()` using only the
   path-derived `cache_path` and return early on HIT, *before* any probe. Probe only on a miss
   (needed to build the `MediaPlan`). Keep passthrough + transcode paths intact.

## Execution order (TDD)

RED -> GREEN per unit, refactor last:

- `cache_path` version marker test -> add `v2` segment.
- `parse_probe_json` tests (v+a / no audio / no video / container / junk) -> add parser.
- `plan_media` tests unchanged (regression guard).
- Wire `probe_media` + reorder `prepare_media` (structural; covered by parser tests + manual
  log re-measure, not a new unit - spawning a sidecar isn't unit-testable here).

## File changes

- `src-tauri/src/media.rs` - all of it. No FE changes. No new files.

## Acceptance verification

- `cargo test` green (new parser + cache tests + untouched plan tests).
- Manual: launch app, drop the same MKV, read the fresh `vidui-*.log`. Expect prepare <200ms on
  HIT, element-load far lower (fresh faststart file). User does this manually.

## Risks

- One-time re-transcode for every already-cached file (new namespace). Mitigation: it's a
  one-off; correctness > reusing fragmented junk. Old dir left in temp, OS cleans it.
- `ffprobe -of json` shape differs from `csv=p=0`. Mitigation: parser tested against real
  captured JSON.

## Decision Log

| Date | Decision | Rationale |
| ---- | -------- | --------- |
| 2026-06-21 | Version cache dir (`v2`) instead of detecting fragmentation at runtime | Cheaper + deterministic; runtime atom-sniffing is fragile and per-load cost. A namespace bump invalidates all pre-faststart files at once. |
| 2026-06-21 | Single `ffprobe -of json` over three csv spawns | Spawn overhead (~500ms each) dominates; one call removes ~1s on miss/passthrough and simplifies to one pure parser. |
| 2026-06-21 | Cache check before probe | On HIT the probes are pure waste; `cache_path` needs only the source path. |
