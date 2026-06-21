# Spec: Fast playback start (FR-13)

**Version:** 0.1.0
**Created:** 2026-06-21
**Status:** Draft
**Feature:** FR-13 (new)

## 1. Overview / why

A real run (`vidui-20260621130312.log`) showed drop->playback of an MKV taking **7084ms**:
`prepare 1605ms | element-load 5479ms | total 7084ms`. Both phases are fixable waste, not
inherent cost.

Two root causes, found by inspecting `media.rs` + the cached file:

1. **`prepare_media` probes before checking the cache.** It runs **three sequential `ffprobe`
   sidecar spawns** (video codec, audio codec, container) every call, *before* the
   `target.exists()` cache check. Bare `ffprobe` is ~50ms, but each Tauri sidecar spawn carries
   ~500ms overhead -> ~1600ms. On a cache HIT all three probes are pure waste: `cache_path`
   depends only on the source path, so a hit can be served without probing at all.

2. **The cached file in the log is a stale, fragmented MP4.** It was written (mtime Jun 20
   19:27) *before* the faststart fix (commit `d335287`, Jun 20 20:40). Its structure:
   `moov` (1283 B, empty sample table) + 2994x `moof`/`mdat` + trailing `mfra`. A fragmented
   MP4 with the index at the end forces WKWebView/AVFoundation to walk thousands of fragments
   over the asset protocol (capped at 1 MB/request) to build a seekable timeline -> ~5.5s of
   IPC round-trips. The **current** code already emits a proper faststart MP4 (verified: moov
   front, single mdat), but `target.exists()` keeps serving the old fragmented file forever
   because nothing invalidates it.

## 2. Scope

In: reorder `prepare_media` so the cache is checked before any probe; collapse the three
`ffprobe` spawns into one; version the transcode cache namespace so stale (pre-faststart) files
are never served. Backend only (`media.rs`).

Out: changing transcode codecs/quality; a cache eviction/size policy; streaming the transcode
before it finishes; touching the FE timeline instrumentation (FR-12 stays as-is, it's how we
measure this).

## 3. Acceptance Criteria

| ID | Criterion | Priority | How verified |
|----|-----------|----------|--------------|
| AC-001 | On a cache HIT, `prepare_media` returns without spawning any `ffprobe` | must | unit test on the decision path + re-measured log (prepare drops to <200ms) |
| AC-002 | A single `ffprobe` spawn yields container + video codec + audio codec (no 3 separate spawns) | must | `parse_probe_json` unit tests + `probe_media` returns one struct |
| AC-003 | The transcode cache namespace is versioned so pre-faststart fragmented files are not served | must | `cache_path` unit test asserts a version marker; stale path differs from new path |
| AC-004 | `plan_media` behaviour is unchanged | must | existing `plan_media` tests stay green |
| AC-005 | A probe that finds no video stream still errors (no regression) | must | `parse_probe_json` test: empty video -> error |

## 4. Data model

`ProbeResult { container: String, vcodec: String, acodec: String }` - parsed from one
`ffprobe -of json` call. `acodec` empty string = no audio (unchanged convention).

## 5. Edge cases

- File with no audio stream -> `acodec = ""` -> `AudioAction::Drop` (unchanged).
- File with no video stream -> error (unchanged behaviour, now decided by the parser).
- ffprobe spawn fails / non-JSON output -> empty `ProbeResult` -> treated as "no video" -> error.
- Multiple audio/video streams -> take the first of each (matches old `v:0`/`a:0` selection).
- Stale fragmented cache file from old namespace -> ignored (new namespace), re-transcoded once.

## 6. Dependencies

ffprobe sidecar (already bundled). FR-12 logging (used to verify the fix).

## 7. AC traceability (implemented)

| AC | Proven by |
|----|-----------|
| AC-001 | structural: `prepare_media` checks `target.exists()` + early-returns before any `probe_media` call (media.rs); re-measured via FR-12 log (manual) |
| AC-002 | `should_populate_all_fields_when_parsing_mp4_h264_aac_json`, `should_populate_all_fields_when_parsing_mkv_h264_opus_json`; `probe_media` makes one spawn |
| AC-003 | `should_contain_v2_version_marker_when_building_cache_path`, `should_differ_from_old_unversioned_path_when_building_cache_path` |
| AC-004 | 7 unchanged `plan_media` tests (TC-001..TC-007) |
| AC-005 | `should_leave_vcodec_empty_when_no_video_stream_in_json` + `prepare_media` `if vcodec.is_empty()` error path |

Status: implemented, all gates green (33 cargo tests, clippy clean, fmt clean, 460 FE tests). Manual on-device re-measure pending (user).
