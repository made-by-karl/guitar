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
