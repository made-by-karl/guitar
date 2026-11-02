# Agent Guide

## Project

- Main app lives in `guitar-app/`.
- This is an Angular 19 standalone app for guitar practice workflows: song sheets, grips, patterns, metronome, tuner, and maintenance/debug pages.
- Deep technical writeups belong in `docs/`; agent procedures and review roles live in `ai/`.

## Layout

- `guitar-app/src/app/features/`: feature areas (`home`, `sheets`, `patterns`, `grips`, `metronome`, `tuner`, `maintenance`)
- `guitar-app/src/app/core/`: shared music logic, services, and reusable UI
- `guitar-app/test/`: Jest specs and test helpers
- `guitar-app/e2e/`: Playwright browser specs
- `docs/`: subsystem docs
- `ai/`: reusable workflows/review roles and guitar-specific product, constraints, and acceptance guidance
- `.agents/skills/`: repo-local Codex skill entry points
- `deployment/`: hosting and SPA deployment notes
- `scripts/`: repo-level helper scripts
- `temp/`: git-ignored drafts, logs, and review screenshots (`temp/ux/<task>/`)

## Architecture Snapshot

- Bootstrapping starts in `guitar-app/src/main.ts`, app-wide providers live in `guitar-app/src/app/app.config.ts`, and routes live in `guitar-app/src/app/app.routes.ts`.
- The app uses standalone components and feature-first routing.
- The app uses zone.js with `provideZoneChangeDetection`; follow existing signal/observable patterns.
- The home route links the practice workflows; the app shell owns navigation and the secondary toolbar slot.
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
- Keep Jest specs under `test/` and browser specs under `e2e/`. Use `--skip-tests` when generating components, then add behavior specs in the matching `test/app/` path.
- For UI work, read `docs/design-guidelines.md` and reuse the existing Bootstrap controls and modal infrastructure.

## Commands

```bash
cd guitar-app
npm start
npm test
npm run build
npm run build-prod
bash ../scripts/verify.sh
```

The location-independent verification gate also runs from the repo root as `bash scripts/verify.sh`.
It runs Jest with `--runInBand --watch=false`, then `npm run build` (production by default).
Browser checks run separately through Docker; see `docs/testing.md`.

## Known Facts

- `npm run build` and `npm run build-prod` generate `src/version.ts` through `../scripts/generate-version.js`.
- The app is an SPA; deployment rewrites are documented in `deployment/DEPLOYMENT.md`.
- There is no obvious lint task in the repo today; verification is mainly tests and builds.
- For UX/browser inspection, prefer the Docker Playwright setup in `compose.playwright.yml` instead of local browser installs. The Compose services run as `${UID:-1000}:${GID:-1000}` so bind-mounted Angular cache files stay owned by the host user. Start the app with `docker compose -f compose.playwright.yml up -d app`, wait for it to become healthy, then run focused Playwright checks with `docker compose -f compose.playwright.yml run --rm e2e bash -lc "npm ci && npx playwright test <spec> --project=chromium"`. Stop it afterward with `docker compose -f compose.playwright.yml down`.
- If local `npm start` fails around `.angular/cache/.../vite/deps` permissions, check for stale cache files from older Docker runs and remove or chown only the generated `.angular/cache` directory.

## Chord Modifier Notes

- Modifier definitions live in `guitar-app/src/app/core/music/modifiers.ts`; treat that file as the source of truth for supported symbols, descriptions, ordering, subset detection, conflict rules, and dissonance classification.
- Chord note construction and chord-string parsing live in `guitar-app/src/app/features/grips/services/chords/chord.service.ts`; grip generation consumes the resolved note set and should not need modifier-specific logic in most cases.
- Modifiers are compositional in this app. Example: `7` adds `b7`, `9` adds `b7 + 9`, and `m + 9` intentionally yields `Cm9`.
- Prefer adding new chord colors as data in `MODIFIER_DEFINITIONS` before adding special-case code. The selector UI reads from `MODIFIERS`, and subset cleanup uses `isModifierSubset`.
- Bare slash syntax is reserved for bass notes only when the suffix after `/` is a note token like `E` or `Bb`. Numeric `6/9` is parsed as a modifier, so `C6/9/E` means the `6/9` chord with `E` in the bass.

## Deep Docs

- Agentic workflow and skill usage: `docs/agentic-workflow.md`
- Product guidance: `ai/product.md`
- Technical and domain constraints: `ai/constraints.md`
- Definition of done: `ai/definition-of-done.md`
- Architecture: `docs/architecture.md`
- UI guidance: `docs/design-guidelines.md`
- Storage: `docs/storage.md`
- Audio: `docs/audio.md`
- Testing: `docs/testing.md`
- Tuner internals: `docs/tuner/README.md`
- Modal patterns: `docs/ui/modal_dialogs.md`
- Deployment: `deployment/DEPLOYMENT.md`

## Agent Workflows

Read the product, constraints, and definition of done for the parts relevant to the task.
The workflow and role files describe reusable procedures; guitar-specific facts belong in this
file, `ai/product.md`, `ai/constraints.md`, `ai/definition-of-done.md`, or the owning subsystem doc.
Keep framework versions, app-specific paths, commands, musical examples, viewports, and fixture details out
of `.agents/skills/`, `ai/workflows/`, and `ai/roles/`.

- `$specify`: `ai/workflows/specify.md` — idea to testable task/spec; create an issue when requested.
- `$implement`: `ai/workflows/implement.md` — clear task to implementation, tests, verification, and review.
- `$component`: `ai/workflows/component.md` — a component integrated with the existing app.
- `$verify`: `ai/workflows/verify.md` — verification gate and checks required by the change.
- `$code-review`: `ai/roles/code-reviewer.md` — read-only correctness and maintainability review.
- `$ux-review`: `ai/roles/ux-reviewer.md` — read-only rendered UI review.
- Supporting lenses: `ai/roles/requirements-analyst.md` and `ai/roles/test-author.md`.

Apply roles within the current session; a role brief does not require spawning subagents.
Use the user's clear request or supplied issue as the task specification. Keep evolving feature
criteria in that task. Inspect status and branch before editing and preserve existing user work.
Create a feature branch before committing; never commit directly to `main`. Fetch and verify
the intended base before starting a new delivery branch. Commit, push, or create a PR when
included in the user's requested delivery; otherwise hand back a reviewable diff. Use
`Closes #<number>` for a PR that fully resolves an issue. Merge and deployment require their
own authorized scope.

Write concise, factual guidance and handoffs. Report changed behavior, verification, and material
limits. The gate is run explicitly; there is no automatic stop hook installed by this setup.
