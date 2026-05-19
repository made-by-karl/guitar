# Architecture Overview

## Summary

The application is a single Angular 19 standalone app rooted in `guitar-app/`. It is organized by feature, with route-level pages under `src/app/features/` and shared services, music utilities, and reusable UI under `src/app/core/`.

## App Entry Points

1. `src/main.ts` bootstraps `AppComponent` with `appConfig`.
2. `src/app/app.config.ts` registers router, HTTP, zone change detection, and the service worker.
3. `src/app/app.routes.ts` maps feature pages to URL paths.
4. `src/app/app.component.ts` owns the shell, navbar, page-toolbar slot, wake-lock toggle, update startup, and early audio/log initialization.

## Feature Map

- `features/sheets`: song sheet library and editor; the main landing area
- `features/patterns`: reusable playing-pattern library and editor
- `features/grips`: chord and grip browsing/editing flows
- `features/metronome`: metronome UI and playback
- `features/tuner`: microphone tuner and debug export tools
- `features/maintenance`: about, settings, logs, and MIDI test pages

## Code Organization

- `src/app/core/music/`: reusable music theory and rhythm helpers
- `src/app/core/services/`: cross-feature services such as audio, MIDI, playback, storage, dialogs, notifications, debug settings, and updates
- `src/app/core/ui/`: reusable UI components, directives, pipes, and modal infrastructure
- `src/app/features/<feature>/pages/`: route entry components
- `src/app/features/<feature>/services/`: feature-specific state and domain logic
- `src/app/features/<feature>/ui/`: feature-local reusable UI

## Architectural Patterns

- Components are standalone and imported directly into other standalone components or tests.
- The repo uses the `@/` path alias with `baseUrl: ./src`.
- Templates use modern Angular control flow syntax such as `@if` and `@for`.
- Business logic is usually kept in services rather than route components.
- Shared persistence and audio concerns are centralized in `core/services`.

## Testing Layout

- Tests live under `guitar-app/test/` and mirror app paths by feature or core area.
- Jest is configured in `guitar-app/test/jest.config.js`.
- Shared browser mocks are installed from `guitar-app/test/setup-jest.ts`.

## Related Docs

- Storage details: `docs/storage.md`
- Audio and playback details: `docs/audio.md`
- Tuner internals: `docs/tuner/README.md`
- Testing patterns: `docs/testing.md`
