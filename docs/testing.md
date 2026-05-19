# Testing Overview

## Summary

The repo uses Jest with `jest-preset-angular`. Tests live under `guitar-app/test/` and generally mirror the structure of the code under `src/`.

## Entry Points

- Jest config: `guitar-app/test/jest.config.js`
- Environment setup: `guitar-app/test/setup-jest.ts`
- Command: run `npm test` from `guitar-app/`

The current config collects coverage from `src/**/*.ts` and excludes `main.ts` and Angular module files.

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
