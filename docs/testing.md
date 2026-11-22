# Testing Overview

## Summary

The repo uses Jest with `jest-preset-angular`. Tests live under `guitar-app/test/` and generally mirror the structure of the code under `src/`.

## Entry Points

- Jest config: `guitar-app/test/jest.config.js`
- Environment setup: `guitar-app/test/setup-jest.ts`
- Command: run `npm test` from `guitar-app/`
- Standard gate: run `bash scripts/verify.sh` from the repo root. It runs `npm test -- --runInBand --watch=false` and then `npm run build` from `guitar-app/`.

The current config collects coverage from `src/**/*.ts` and excludes `main.ts` and Angular module files.

For a focused unit run, use `npm test -- --runInBand --watch=false --runTestsByPath test/app/path/to/file.spec.ts`
from `guitar-app/`, replacing the path with the owning spec. Keep new specs under `test/` and use
`@/app/...` imports for app code. Component generation should pass `--skip-tests` to avoid specs in `src/`.

## Common Patterns

### Standalone component tests

- Import standalone components directly into `TestBed.configureTestingModule({ imports: [...] })`.
- Provide route stubs with `provideRouter(...)` when the component depends on navigation.
- Mock injected services with simple objects and `jest.fn()`.

`guitar-app/test/app/app.component.spec.ts` is a good reference for route-aware shell testing.

### Service tests

- Construct services directly with mocked collaborators when Angular DI is unnecessary.
- Use plain object doubles for Dexie tables, audio services, and other dependencies.
- Prefer focused behavioral assertions over broad snapshots.

Examples:

- `test/app/features/sheets/services/song-sheets.service.spec.ts`
- `test/app/core/services/midi.service.spec.ts`
- `test/app/core/services/playback.service.spec.ts`

### Time and browser API tests

- Use fake timers when verifying scheduled playback behavior.
- Stub browser APIs explicitly for audio and media flows.
- Shared jsdom polyfills for `localStorage`, `sessionStorage`, and a few style APIs already exist in `test/setup-jest.ts`.

`test/app/features/tuner/services/tuner.service.spec.ts` is the best reference for microphone and `AudioContext` mocking.

## What To Test

- Add service-level tests when changing playback planning, storage normalization, audio behavior, or tuner logic.
- Add component tests when route/UI wiring, modal flows, or rendered controls change materially.
- When fixing regressions in a nontrivial subsystem, prefer a targeted spec that reproduces the broken behavior before or alongside the code change.

## Practical Notes

- There is no obvious lint task in the repo today, so tests and builds are the main verification paths.
- The repo mocks `tone` in Jest via `test/__mocks__/tone.ts`.
- Keep tests aligned with the repo's existing style: direct mocks, explicit setup, and small behavior-focused cases.

## Browser Tests and UX Inspection

Playwright specs live in `guitar-app/e2e/`. The configuration in `guitar-app/playwright.config.ts`
defines the `chromium` project. Use the existing Docker setup from the repo root:

```bash
docker compose -f compose.playwright.yml up -d app
docker compose -f compose.playwright.yml ps app
```

Wait until `app` is healthy, then run a focused spec:

```bash
docker compose -f compose.playwright.yml run --rm e2e bash -lc "npm ci && npx playwright test e2e/app-smoke.spec.ts --project=chromium"
```

Replace the spec path for the affected flow. To run all browser specs, omit the path after `test`.
Stop the services after the check:

```bash
docker compose -f compose.playwright.yml down
```

- Compose supplies `PLAYWRIGHT_BASE_URL=http://guitar-web:4200`, so Playwright uses the container's
  app instead of launching another dev server. Outside Compose the config defaults to localhost.
- Keep the Compose `${UID:-1000}:${GID:-1000}` user mapping so generated bind-mounted files stay
  owned by the host user. Stale Vite permission failures should be repaired only in `.angular/cache`.
- Use disposable data and an isolated browser context for editing, reset, and migration checks.
  Existing examples include `e2e/database-upgrade.spec.ts`, `e2e/song-arrangement.spec.ts`, and
  `e2e/selection-modes.spec.ts`.
- Playwright's HTML report is under `guitar-app/playwright-report/`; failure traces, screenshots,
  and videos are under `guitar-app/test-results/`. Both paths are ignored by Git.
- For a visual review, retain curated screenshots and captions in `temp/ux/<task>/`, following
  [design-guidelines.md](design-guidelines.md) and [../ai/roles/ux-reviewer.md](../ai/roles/ux-reviewer.md).
  Extend a focused spec or use a scratch browser script inside the same container when needed.
- Browser checks with simulated microphone/audio do not establish real tuning accuracy or
  audible playback quality. Report listening/device checks separately.

The unit/build gate does not start Docker or run browser tests. The applicable acceptance checks
are listed in [../ai/definition-of-done.md](../ai/definition-of-done.md).

## Media playback and iPhone verification

Run `e2e/media-playback.spec.ts` through the Docker workflow above using the default Chromium
project. The focused `playwright.media.config.ts`
also provides WebKit without changing unrelated specs. In the e2e container, run
`npx playwright test --config=playwright.media.config.ts --project=webkit` for that engine
(or omit the project flag for both). Desktop WebKit is not iPhone Safari. The spec tracks actual HTML
media elements, decodes the rendered WAV to check nonzero samples, exercises rejection/retry,
Stop during a held sample request, navigation cleanup, repeated-occurrence transport and
three complete uninterrupted native metronome loop boundaries at 20, 80 and 260 BPM,
without injected seeks or playback-rate changes. The 20 BPM fixture takes about 2.5 minutes;
its extended timeout is intentional. Device timing and listening checks remain separate.
The long-plan check renders a five-minute plan and seeks through its final release; it does
not establish five minutes of uninterrupted real-device playback.

Browser screenshots belong under `temp/ux/media-playback/`. Desktop preparation metrics are
retained there as `desktop-five-minute-<project>.json`; browser tests do not establish physical-device
memory use, iPhone Silent Mode behavior or listening acceptance.

Before accepting issue #4 on a device, record iPhone model, exact iOS/Safari version, tab or
installed mode, media volume/output route and Silent Mode setting. From a fresh load, check
cold and cached grip/custom-grip, library and local pattern, measure/occurrence/song, MIDI
maintenance/percussion and metronome playback. If preparation exposes Play, use that action.
Repeat with Silent Mode off and zero media volume. Confirm no sound begins merely by opening
or focusing a page, and no microphone permission is requested by output preparation.

Exercise Stop/navigation while loading, interrupted pause/resume, seeks across repeated
occurrences, continuous single/group slides, long releases and rapid metronome changes. Listen
on the lock screen for pause/resume, seek and Play after natural completion: the last clip
should restart from zero with sharp artwork and the app transport/highlights should follow it.
Check Stop/navigation clear the session and cannot restart old audio. iOS may keep a recent-media
card visible after session cleanup; record that separately from playback correctness. Check
preview completion returns system controls to a metronome that is still running. Listen
across at least three complete loop boundaries at low, medium and high tempo and grouped meters.
On the phone, play a representative five-minute arrangement to completion and record cold/cached
preparation time, rendered sizes, memory/resource observations and cleanup after leaving.

Compare processed palm-muted and dead-note strums against their accepted A/C sounds, with
accent combinations, both directions, string ranges, alternate tuning/capo and low/high pitches.
`e2e/dead-note-strum.spec.ts` covers compact articulation selection, keyboard toggling,
cancel/save persistence, cross notation and actual rendered WAV decay; device listening remains separate. `e2e/media-service-worker.spec.ts` serves the
production build on a disposable local origin and verifies source sample caching, offline
retrieval and activation of a changed source revision. Run the build first; that spec skips
without generated production files. It changes only in-memory test responses. These checks
verify sample requests, not complete offline application operation or iPhone support.

## Live measure editor preview

Run `e2e/measure-editor-preview.spec.ts` and the existing `e2e/song-measure-toolbar.spec.ts`
through the Docker workflow above. The preview spec uses disposable mixed measures and
compares individual SVG slot outlines with actual action-card intersections in the reduced
forms viewport. It covers song drafts, pattern measure changes, nested grip return, subdivision
and meter edits, collapse/expand, keyboard navigation and the short viewport. A resized
375×400 viewport simulates constrained space; it does not establish real virtual-keyboard behavior.
Curated screenshots belong in `temp/ux/floating-measure-editor-preview/`.

The editor preview is a separate pane above the scrolling forms. Its chevron reclaims space, with a “Measure preview” label when collapsed;
measure identity is available to assistive technology without an additional visible heading.
The pane fits all grip-label lines without vertical scrolling. Only the editor opts into
single-row notation and visible-slot outlines. Preceding measures
supply notation history without being drawn. Preview geometry and expanded state are transient
and do not cross existing Apply/Save boundaries.

## Synchronized song playback highlighting

Run `e2e/playback-highlighting.spec.ts` through the Docker workflow. Its three-minute
foreground test intentionally has a four-minute timeout and does not seek or accelerate the
media. It checks repeated sections and whole rests, records DOM slot transitions against
`HTMLAudioElement.currentTime` at the beginning, middle and end, and waits for actual completion.
Short consecutive-attack fixtures cover 60 and 180 BPM with pause and seek. The first partial
slot observation is excluded from boundary latency measurements.

The remaining cases cover all song/occurrence/part/editor entry points at the documented
viewports, later-measure preview, draft/selection/lock preservation, preparation cancellation,
rejected startup, keyboard focus, reduced motion and tab teardown. It also checks persistent stream DOM across
measure/occurrence boundaries, no duplicate pane controls, reuse of the measure editor's live
preview and manual page scrolling during playback without being pulled back. Existing arrangement,
measure-editor and media playback specs remain useful regressions.

Curated screenshots, the review record and timing JSON are under
`temp/ux/playback-highlighting/`. Timing is software evidence from foreground Chromium, not a
screen/audio capture of physical output. The issue #5 target of 50 ms against heard audio
still needs built-in-speaker or wired-output measurements and listening at 60/120/180 BPM;
record device, OS/browser and route. Bluetooth, background animation and manual calibration
are outside this feature's scope.

## Song play view

Run `e2e/song-play-view.spec.ts` through the Docker workflow. It covers silent entry, attaching
to playing/paused song media, unsaved-work cancellation, presentation-only exit, focus return,
Stop, completion/replay, interruption/rejected startup, missing and limited diagrams, repeated
occurrences, rest measures, lyric scroll preservation and wide notation following. Viewports
are 375×667, 768×1024 and 1280×800, plus 667×375 landscape; keyboard and reduced motion are
included. The three-minute foreground case runs without seeking or changing playback rate
and records shared-media versus DOM position/lyric observations at the start, middle and end.

Evidence belongs under `temp/ux/song-play-view/`. These browser observations establish software
position mapping and layout, not heard-audio timing or real-device touch behavior. Recheck
physical output with the view visible for the 50 ms target using screen/audio capture and
built-in speakers or a wired route; record device/browser/route and listening results separately.

The play-view suite also checks continuous progress inside one notation slot, pause freezing,
fixed grip-card geometry, media-time handoff highlighting, empty upcoming cards, occurrence
bar resets, and completion. Upcoming grip countdowns retain their fill and speed when moving
from After next to Next, including on seeks. The three-minute case samples all three progress
bars against media time as well as the notation/grip/occurrence/lyric mapping. Current evidence for these timing
cues is under `temp/ux/song-play-view-progress/`.

Continuous Play view coverage checks the full arrangement before Play, persistent SVG content
across repeated occurrences and rests, manual idle/paused browsing, and immediate following
on Resume. Screenshots and timing evidence for this presentation are kept under
`temp/ux/song-play-view-continuous/`. The shared notation marker uses global score slot indexes.
Both three-minute recorders attach before Play so asynchronous startup polling cannot skip
the opening measurement window; they retain the same sample-count and 50 ms limits.

## Articulation model compatibility

Run `e2e/dead-note-strum.spec.ts`, `e2e/database-upgrade.spec.ts` and
`e2e/json-import-export.spec.ts` through Docker after articulation changes. Upgrade checks
cover old databases through current version 11 and compare stored aggregates after reopening.
Jest covers legacy flag precedence, idempotency, all three portable file kinds, current-model
validation, independent Accent, distinct playback instructions and notation. UI evidence at
375×667, 768×1024 and 1280×800 belongs under `temp/ux/song-sheet-editing-consistency/`.
These checks do not establish real-device audible quality.

`e2e/articulation-layout.spec.ts` checks separate chord-name, modifier and staff bands in
wrapped scores and the live measure preview, including Palm Mute with Accent, upward
strums and chord leaders reaching the action through the modifier band. Compact checkbox labels,
keyboard toggling and screenshots at the standard viewports
are covered alongside `e2e/dead-note-strum.spec.ts`. Layout evidence is kept under
`temp/ux/mobile-articulations/`.

## Reachable part actions and compact transport

Run `e2e/song-part-actions.spec.ts`, `e2e/song-part-editor.spec.ts`,
`e2e/song-measure-toolbar.spec.ts`, `e2e/song-sheet-review.spec.ts` and
`e2e/playback-highlighting.spec.ts` through Docker after part action or transport changes.
The action suite checks 20-measure parts at the top, middle and end at 375×667, 768×1024,
1280×800 and 375×400, icon-only Save/Apply in the breadcrumb, reserved contextual action space,
guarded return, focus restoration and accessible save status. Card checks hold preparation and reject startup before exercising
ready/play/pause/seek/resume/error/retry/stop with the same media owner. They compare computed
card, content and text colors across states and retain evidence under
`temp/ux/song-sheet-editing-consistency/`. Browser audio and resized viewports do not establish
real-device listening or virtual-keyboard/safe-area behavior.

## Full-song section navigation

`e2e/song-play-view.spec.ts` covers Previous/Next part in both transports at the standard
phone/tablet/desktop sizes, including repeated/adjacent occurrences, a rest-only section,
playing/paused seeks, rapid requests, boundaries, media reuse and an unrelated editor draft.
Jest covers snapshot targets, single-occurrence songs and unavailable session states.
Section-navigation screenshots are under `temp/ux/song-sheet-editing-consistency/`.


## Song-sheet editor workspace

`e2e/selection-design.spec.ts` checks the shared blue selection surface and contrasting icon
action bars in Song, Parts, Measures, Grips, and Patterns. It measures enabled and disabled icon
contrast over black/white underlays of the translucent surface, including hover, pressed and
keyboard-focus states. It also checks keyboard selection, contextual copy/delete/clear, aligned
desktop boxes, matching 32px preview controls and 44px touch targets, top-right close buttons,
an empty button column before Delete, shared mobile playback/editing columns, vertically
aligned headings/close icons, a slight list-width inset, and breadcrumb/preview separation
during outer-page scrolling.
Screenshots at 375×667, 768×1024 and 1280×800 are retained under `temp/ux/selection-design/`.
Run it with the workspace, grip-card, selection-mode, measure-toolbar, part-action and live-preview
suites when changing these shared interaction styles. Resized Chromium and touch emulation do
not establish physical-device touch or virtual-keyboard behavior.

Run `e2e/song-workspace.spec.ts` together with the updated arrangement, selection, part-editor,
measure-toolbar, part-actions and sheet-tab suites through Docker. The workspace suite covers
selection before editing, no editor dialog, one-line ancestry, retained parent drafts, measure
Apply and guarded discard, save/reload, shared locks, in-page Notes and local pattern drafts. It checks
375×667, 768×1024, 1280×800, both sides of the 700/701px breakpoint and 375×400. Browser console
errors fail the workspace suite. Jest covers nested guard ordering, pending and failed saves,
source isolation, active-level save ownership and pattern navigation decisions. The breadcrumb
uses a single 44px save icon and guarded Back; no bottom editor action row is present. Measured
text-contrast artifacts are retained as `workspace-contrast-*.json` beside the screenshots.

Use `measure-editor-preview.spec.ts`, `playback-highlighting.spec.ts`, `song-part-actions.spec.ts`
and `song-play-view.spec.ts` for notation/grip-dialog return, transport recovery and the separate
Play view. Retain workspace screenshots and review captions under
`temp/ux/song-sheet-editing-consistency/`. Resized Chromium viewports do not establish physical
touch, virtual-keyboard or device safe-area behavior; browser playback does not establish
heard-audio quality.

## Incremental streaming playback (issue #29)

Run the separate secure-origin suite for native media streaming in Chromium and desktop
WebKit. The Docker hostname is not a secure context; a test-only localhost proxy preserves
normal browser security settings and enables the same APIs available on HTTPS deployments.

```bash
docker compose -f compose.playwright.yml up -d app
docker compose -f compose.playwright.yml run --rm e2e bash -lc "npm ci && npx playwright test --config=e2e/streaming-playback.config.ts --workers=2"
# Opt-in complete 265-second playback at normal speed, with cold/warm timing and replay:
docker compose -f compose.playwright.yml run --rm e2e bash -lc "STREAMING_ACCEPTANCE=1 npx playwright test --config=e2e/streaming-playback.config.ts --grep 'long example completes' --workers=2"
# Opt-in complete-file baselines, explicitly forcing the original WAV strategy:
docker compose -f compose.playwright.yml run --rm e2e bash -lc "STREAMING_BENCHMARK=1 npx playwright test --config=e2e/streaming-playback.config.ts --grep 'full-file baseline'"
# Existing suites on the same secure origin (includes long metronome/highlight cases):
docker compose -f compose.playwright.yml run --rm e2e bash -lc "npx playwright test --config=e2e/media-compatibility.config.ts --workers=2"
docker compose -f compose.playwright.yml down
```

The ordinary stream suite proves prefix-only startup, continuity beyond the first window,
playing/paused and rapid section seeks, same-element reuse, cache reappend after browser
pruning, deliberate underrun/Pause/recovery, persistent-quota complete-WAV retry, and
keyboard reachability at 375×667, 768×1024 and 1280×800. A real-media comparison concatenates
window PCM and decodes independent FLAC/MP4 fragments against the complete WAV renderer
across strum spreads, slides/legato, percussion, damping, rests and release. Frame counts
must match (within two samples at release trimming) and sample error is limited to two
16-bit PCM steps. These are signal/timing tests, not a physical-output listening claim.

Jest adds controlled source demand/eviction, quota, abort/replacement, latest/native seeks,
cache identity/reuse and immediate canceled-consumer recovery. Interactive preparation can
overtake speculative windows between native renders. Stream buffering remains distinct from
Pause, and old Playing/native-error events cannot restart stopped media or reclaim controls.
Use `bash scripts/verify.sh` for the repository gate; type-check the browser harness with
`npx tsc -p e2e/tsconfig.streaming.json` from `guitar-app/` and syntax-check its proxy with
`node --check e2e/helpers/streaming-origin-proxy.cjs`.

The retained AAC experiment is diagnostic. It exercises real encoding, MP4 append, startup,
intentional prefix exhaustion, append-driven recovery and seek, separately for MediaSource
and ManagedMediaSource. Unsupported combinations are explicitly skipped, not counted as
streaming acceptance. It continuously encodes a synthetic signal before append and records
its presentation deficit; it is not the production codec or an incremental-render test.
Bundled Chromium 149 had no AAC encoder. WebKit 26.5 supported both source APIs but the raw
experiment presented 528,384 frames for 529,200 input frames (approximately 18.5 ms short).
The production FLAC strategy avoids that priming/padding problem and passes the PCM checks.

Evidence lives under git-ignored `temp/ux/streaming-playback/`:

- `baseline-{tears,openRoad,risingSun}-{chromium,webkit}.json`: planning, sample bank/decode,
  articulation, Tone/native render, postprocess, WAV encode, first Playing and buffer data.
- `production-smoke-*.json`, `pcm-comparison-*.json`, `long-stream-*.json`: actual streaming
  startup, prefix generation, complete playback/underruns, buffer observations and replay.
- `buffering-{375,768,1280}-{chromium,webkit}.png`: keyboard Pause, frozen notation and
  visible Buffering status in the existing layouts.
- `aac-{media,managed}-*.json`, `results/`, `regression-results/`: prototype diagnostics
  and browser traces. `baseline-dialog.log` and `baseline-dialog-results/` retain the
  comparison for four unrelated grip-dialog shell assertions also failing on untouched main
  at `4d3a894` (375/1280px in both engines). Their preview startup/retry succeeds; the final
  `.page-playback-feedback` restoration assertion expects one element and finds zero.

The four known grip-dialog failures can be excluded with `--grep-invert 'blocked grip'`
when checking the other regressions. Chromium's two three-minute clock checks pass.
WebKit completes those runs with correct positions but fails the unchanged 50 ms marker
limit: isolated maxima were 67 ms in the editor and 86 ms in Play view. A separate untouched
`4d3a894` WAV comparison of the same opening two-second windows also fails (149/82 ms).
`clock-isolated.log`, `baseline-clock.log`, `baseline-clock/` and `baseline-clock-results/`
retain that evidence; these are disclosed desktop WebKit timing limits, not passing checks.
Keep long timing checks isolated from other browser and build jobs to reduce contention.
The WebKit touch-scrolling case is explicitly skipped because its swipe injection uses
Chromium CDP; resizing a desktop WebKit page does not replace physical touch verification.

The 2026-11-22 complete-file baseline for Tears in Heaven measured startup to Playing:

| Engine | Fresh context | Warm samples, rerender | Cached WAV |
| --- | ---: | ---: | ---: |
| Docker Chromium 149 | 33.19 s | 31.57 s | 0.30 s |
| Desktop WebKit 26.5 | 27.36 s | 26.09 s | 0.72 s |

The final 265-second streaming run completed at normal speed with zero underruns in
both engines. Only the opening four seconds had been generated at first Playing:

| Engine | Fresh context | Warm samples, rerender | Encoded song cache | Decoded assets |
| --- | ---: | ---: | ---: | ---: |
| Docker Chromium 149 | 1.28 s | 0.65 s | 6.40 MB | 3.70 MB |
| Desktop WebKit 26.5 | 2.45 s | 0.86 s | 6.48 MB | 3.74 MB |

These cold runs include loading the codec and its compatibility probe. Warm runs clear
encoded fragments but retain samples and codec libraries; neither makes another sample
request. The largest native offline context was 8.87 seconds, including pre-window voice
history, and observed main window PCM peaked at 1.56 MB. Chromium's optional heap reading
peaked at 68 MB; WebKit does not expose that reading. The encoded cache remains capped at
32 MiB across songs, decoded assets at 16 MiB, independently of these fixture measurements.

This is an exploratory shared-host development run, not physical reference-device acceptance.
Chromium's cold run overlapped the repository gate; warm and WebKit runs followed it.
The main whole-song float buffer alone was 47,156,176 bytes, alongside an approximately
23.4 MB WAV. Short sparse-stream smoke startup measured approximately 0.6 seconds, with
only the opening four seconds generated. The 15-second threshold includes estimated release;
four-second windows and a 24-second ahead target keep work bounded while preserving previews.
The issue's two-second warm-start target remains a measured desktop target, not an iPhone
or cold-network guarantee. Full-song streaming measurements are recorded separately above.

Stage durations overlap: preparation includes bank loading, decode, articulation and
scheduling; Tone rendering includes its clock plus native offline work. Do not sum those
columns. The legacy `sampleBankMs` instrumentation applies to WAV sampler creation;
streaming shared-asset loading is included in preparation, decode and resource observations.
Main PCM/cache bytes and optional JS heap exclude other native allocations.
First Playing is a media event; first advancing clock includes polling/gesture latency.
Neither measures heard sound. Browser eviction is tested against actual buffered ranges.
Fixture snapshots under `guitar-app/test/fixtures/streaming-playback/` preserve normal import
normalization; local `examples/` remain untracked and are not read by the suite.

The user clarified that foreground notation is primary, no additional reference devices
are available, and stopping while locked is acceptable. Physical-device testing is therefore
a disclosed limit, not a gate for uninterrupted background generation. When hardware is
available, record model, OS/browser, tab/installed mode, output route, Silent Mode, cold/warm
timing, interruption and listening results. Lock past the initial buffered interval, unlock
and exercise recovery, Pause/Play/Stop, section/time seeks and route exit. Verify that stopped
or superseded work cannot restart audio. Desktop WebKit does not certify iPhone behavior.
