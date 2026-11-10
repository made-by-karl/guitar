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
across at least three complete loop boundaries at low, medium and high tempo and grouped meters.
On the phone, play a representative five-minute arrangement to completion and record cold/cached
preparation time, rendered sizes, memory/resource observations and cleanup after leaving.

Replace the synthetic palm-muted WAVs using their bank README before comparing matched-level
clean and recorded palm-muted picks/strums, accented combinations, alternate tuning/capo and
low/high pitches. That listening acceptance is intentionally deferred while placeholders ship.
`e2e/media-service-worker.spec.ts` additionally serves the production build on a disposable
local origin and verifies fresh caching of all seven WAVs plus retained MP3s, offline retrieval,
and activation of a changed WAV fixture. Run the build first; that spec skips without generated
production files. It changes only in-memory test responses. This verifies these asset requests,
not complete offline application operation or iPhone support.
