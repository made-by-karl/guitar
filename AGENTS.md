# Agent Guide

## Project

- Main app lives in `guitar-app/`.
- This is an Angular 19 standalone app for guitar practice workflows: song sheets, grips, patterns, metronome, tuner, and maintenance/debug pages.
- Deep technical writeups belong in `docs/` or `guides/`, not here.

## Layout

- `guitar-app/src/app/features/`: feature areas (`sheets`, `patterns`, `grips`, `metronome`, `tuner`, `maintenance`)
- `guitar-app/src/app/core/`: shared music logic, services, and reusable UI
- `guitar-app/test/`: Jest specs and test helpers
- `docs/`: subsystem docs
- `guides/`: focused implementation guides
- `deployment/`: hosting and SPA deployment notes
- `scripts/`: repo-level helper scripts

## Architecture Snapshot

- Bootstrapping starts in `guitar-app/src/main.ts`, app-wide providers live in `guitar-app/src/app/app.config.ts`, and routes live in `guitar-app/src/app/app.routes.ts`.
- The app uses standalone components and feature-first routing.
- Persistence uses Dexie/IndexedDB through `DatabaseService`.
- Playback audio uses Tone.js via `AudioService` and `MidiService`.
- Tuner microphone capture is a separate browser-audio pipeline under `features/tuner/services/`.

## Working Conventions

- Run app commands from `guitar-app/`.
- Use the `@/` path alias for app imports.
- Follow existing standalone Angular patterns and control flow syntax (`@if`, `@for`).
- Keep styles in SCSS and stay consistent with the Bootstrap-based UI already in the repo.
- Preserve strict TypeScript typing instead of widening types to make changes compile.
- Add or update Jest specs when changing nontrivial behavior.

## Commands

```bash
cd guitar-app
npm start
npm test
npm run build
npm run build-prod
```

## Known Facts

- `npm run build` and `npm run build-prod` generate `src/version.ts` through `../scripts/generate-version.js`.
- The app is an SPA; deployment rewrites are documented in `deployment/DEPLOYMENT.md`.
- There is no obvious lint task in the repo today; verification is mainly tests and builds.

## Chord Modifier Notes

- Modifier definitions live in `guitar-app/src/app/core/music/modifiers.ts`; treat that file as the source of truth for supported symbols, descriptions, ordering, subset detection, conflict rules, and dissonance classification.
- Chord note construction and chord-string parsing live in `guitar-app/src/app/features/grips/services/chords/chord.service.ts`; grip generation consumes the resolved note set and should not need modifier-specific logic in most cases.
- Modifiers are compositional in this app. Example: `7` adds `b7`, `9` adds `b7 + 9`, and `m + 9` intentionally yields `Cm9`.
- Prefer adding new chord colors as data in `MODIFIER_DEFINITIONS` before adding special-case code. The selector UI reads from `MODIFIERS`, and subset cleanup uses `isModifierSubset`.
- Bare slash syntax is reserved for bass notes only when the suffix after `/` is a note token like `E` or `Bb`. Numeric `6/9` is parsed as a modifier, so `C6/9/E` means the `6/9` chord with `E` in the bass.

## Deep Docs

- Architecture: `docs/architecture.md`
- Storage: `docs/storage.md`
- Audio: `docs/audio.md`
- Testing: `docs/testing.md`
- Tuner internals: `docs/tuner/README.md`
- Modal patterns: `docs/ui/modal_dialogs.md`
- Deployment: `deployment/DEPLOYMENT.md`
