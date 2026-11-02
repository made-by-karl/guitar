# Guitar Companion

Guitar Companion is a self-guided guitar practice app. It does not try to teach a course or replace a teacher; it keeps the supporting tools for your own practice workflow in one place.

The hosted app is available at [guitar.made-by-karl.de](https://guitar.made-by-karl.de).

## Features

- Song sheets for organizing songs, arrangements, and practice notes
- Chord grip exploration for comparing playable fingerings
- Playing pattern tools for working on strumming and picking ideas
- A metronome for timing-focused practice
- A tuner for quick setup before or during practice
- Maintenance and debug pages for updates, settings, logs, and diagnostics

## Tech Stack

- Angular 19 standalone application
- Dexie with IndexedDB for local persistence
- Tone.js for playback and audio-related features
- Service worker support for installable PWA behavior and update delivery

## Local Development

Run app commands from `guitar-app/`:

```bash
cd guitar-app
npm start
npm test
npm run build
npm run build-prod
bash ../scripts/verify.sh
```

## Project Layout

- `guitar-app/` main Angular application
- `docs/` architecture and subsystem documentation
- `ai/` agent workflows, review roles, product guidance, and implementation constraints
- `.agents/skills/` repo-local Codex skills
- `deployment/` SPA hosting and deployment notes
- `scripts/` repository helper scripts

## Agentic Development

Start with [`AGENTS.md`](./AGENTS.md). The [`workflow guide`](./docs/agentic-workflow.md)
describes the `specify`, `implement`, `component`, `verify`, `code-review`, and `ux-review`
skills, project-specific guidance, and Docker browser checks.

## License

This project is published under the GNU GPL v3.0. See [`COPYING`](./COPYING) for the full license text.
