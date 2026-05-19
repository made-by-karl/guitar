# Audio Overview

## Summary

The app has two separate audio pipelines:

1. Playback audio for notes, strums, percussion, metronome, and arranged song playback
2. Microphone capture for the tuner

They solve different problems and should usually be changed independently.

## Playback Pipeline

### Shared audio runtime

`AudioService` owns the shared Tone.js context and sampler lifecycle.

- Starts Tone lazily through `ensureStarted()`
- Installs app-wide auto-resume handlers for focus, visibility, and user interaction
- Deduplicates sampler initialization by key
- Exposes the Tone transport and current time helpers

### Instrument rendering

`MidiService` builds on `AudioService` and is responsible for:

- creating the guitar sampler from `public/samples/notes/`
- creating the percussion sampler from `public/samples/percussion/`
- translating `MidiInstruction` objects into sampler calls
- handling technique-specific playback such as muted notes, accents, sequential strums, slides, hammer-ons, pull-offs, and percussion hits

### Scheduling and higher-level playback

- `PlaybackService` provides reusable playback primitives and finite playback sessions.
- `FinitePlaybackScheduler` controls play/pause/resume/seek for bounded playback plans.
- `PlayingPatternPlaybackPlannerService` turns pattern measures plus grip context into timed `MidiInstruction` sequences.
- `SongPartPlaybackService` resolves song-sheet parts into playback plans and drives arranged part or single-measure preview playback.
- Metronome playback is implemented in `features/metronome/services/`.

## Tuner Pipeline

The tuner does not use Tone.js for capture. It has its own browser-audio path:

- `TunerAudioSession` requests microphone access, creates an `AudioContext`, attaches an `AnalyserNode`, and tracks interruption events.
- `TunerService` owns the frame loop, startup/stop lifecycle, and debug export.
- `tuner-detector.ts` performs frame-level pitch detection.
- `tuner-tracker.ts` applies multi-frame acceptance and correction logic.
- `tuner-state-projection.ts` converts accepted tracking state into UI-facing display values.

Read `docs/tuner/README.md` before changing tuner detection or tracking behavior.

## Practical Guidance

- If a change affects sampler loading, transport behavior, playback timing, or audio resume, start in `core/services/`.
- If a change affects grip-to-note translation or pattern timing, start in `features/patterns/services/playing-pattern-playback-planner.service.ts`.
- If a change affects microphone support, interruption handling, pitch ranking, or tuner display state, start in `features/tuner/services/`.
- Keep playback audio changes and tuner microphone changes separate unless you are intentionally working on a cross-cutting browser-audio issue.
