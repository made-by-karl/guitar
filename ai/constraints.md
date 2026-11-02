# Guitar implementation constraints

Read the sections relevant to the change alongside [../AGENTS.md](../AGENTS.md). These are
project-specific inputs to the reusable workflows and review roles.

## Runtime and code organization

- The app is Angular 19 with standalone components, strict TypeScript/templates, and zone.js.
  `app.config.ts` uses `provideZoneChangeDetection`; follow the local signal/observable patterns
  without introducing a zoneless migration as part of unrelated work.
- Run app tooling from `guitar-app/`. Import app code with `@/` (for example,
  `@/app/core/services/audio.service`). Tests may use `@test/` for test helpers.
- Feature pages, services, and local UI live under `src/app/features/`; shared music rules,
  services, and UI live under `src/app/core/`. Put new shared code there only when it has shared
  responsibility. Read [../docs/architecture.md](../docs/architecture.md) for entry points.
- Use `@if` and `@for`, SCSS, Bootstrap 5.3, and Bootstrap Icons. Follow
  [../docs/design-guidelines.md](../docs/design-guidelines.md) for UI work.
- Jest specs belong under `guitar-app/test/`, mirroring app paths. Browser specs belong under
  `guitar-app/e2e/`. Angular generation must use `--skip-tests` so it does not leave specs in `src/`.
- `npm run build` and `npm run build-prod` generate `guitar-app/src/version.ts` from
  `package.json` via `scripts/generate-version.js`. Let the build generate it.

## Storage and musical ownership

- Dexie persistence is owned by `DatabaseService`. Read [../docs/storage.md](../docs/storage.md)
  and the actual registered versions before changing schema or normalization.
- Preserve released upgrades; add explicit migrations for persistent shape changes. Cover legacy
  inputs and reopening current data. Existing historical resets do not authorize new data loss.
- Store plain data, not runtime `Grip` instances, audio nodes, or shared mutable object graphs.
  Follow service cloning and normalization helpers.
- Sheet patterns are local snapshots; global library patterns are separate records. Keep part
  identity, measure identity, occurrence order, and occurrence lyrics intact when editing or migrating.
  See [../docs/song-arrangements.md](../docs/song-arrangements.md).

## Chords and grips

The chord modifier notes in [../AGENTS.md](../AGENTS.md#chord-modifier-notes) are authoritative.
Use `core/music/modifiers.ts` as the source for definitions and relationships, and
`features/grips/services/chords/chord.service.ts` for parsing and note construction.
Prefer modifier data over special cases in grip generation. Check compositional modifiers,
numeric `6/9`, and slash bass parsing when changing this boundary. Grip generation guidance is
in [../docs/grip-finding.md](../docs/grip-finding.md).

## Playback and microphone capture

- Read [../docs/audio.md](../docs/audio.md) for playback changes. `AudioService` owns the Tone.js
  context and samples; `MidiService` renders instructions; planners and playback services own
  timing and sessions. Sample assets are under `guitar-app/public/samples/`.
- Preserve user-gesture startup and interrupted-context recovery. Stop, pause, resume, seek,
  looping, and component destruction must not leave duplicate schedules or sounding voices.
- Keep notation and playback aligned for string selection, grips, slides, and legato. Test timing
  with controlled clocks and audio collaborators; a mocked sampler cannot prove audible quality.
- The tuner uses its own browser-audio capture pipeline under `features/tuner/services/`.
  Read [../docs/tuner/README.md](../docs/tuner/README.md) before detection/tracking changes.
  Cover permission denial, unavailable devices, interruptions, and cleanup when relevant.
- Microphone capture requires a secure context (or localhost). Record hardware/audio checks
  separately from browser checks using simulated inputs.

## Verification and environment

- The standard gate is `bash scripts/verify.sh`: Jest in a single process, then the production
  Angular build. There is no configured lint or formatter task.
- Use the existing `compose.playwright.yml` for browser work. Commands, fixtures, and cleanup
  are in [../docs/testing.md](../docs/testing.md). Keep its host-user ownership behavior.
- If Vite cache permissions fail after an older Docker run, inspect and remove or chown only
  the generated `guitar-app/.angular/cache` directory.
- The app is an SPA with a production service worker. Route refreshes, assets, cache updates,
  and hosting rewrites must follow [../deployment/DEPLOYMENT.md](../deployment/DEPLOYMENT.md).
- Put uncommitted drafts, review screenshots, and logs under the existing git-ignored `temp/`,
  for example `temp/ux/<task>/`. Use disposable browser data when reviewing reset/delete flows.
