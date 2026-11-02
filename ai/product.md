# Product charter — Guitar Companion

Guitar Companion supports self-guided guitar practice in the browser. Players prepare song
sheets, explore chord grips, build reusable playing patterns, rehearse with playback and a
metronome, and tune through the microphone. The home page connects these workflows;
maintenance pages expose settings, updates, logs, and MIDI diagnostics.

This file records durable product guidance. Acceptance criteria for individual changes belong
in the task or its issue. Engineering acceptance lives in [definition-of-done.md](definition-of-done.md).

## Principles

- Keep practice controls readable and quick to operate on phones, tablets, and desktops.
  Dense musical editors still need usable touch targets and clear selection feedback.
- Preserve the player's work. Song sheets and custom patterns live on the device in
  IndexedDB; editing reusable material must respect the ownership of existing arrangements.
- Keep musical meaning consistent across chord labels, grip diagrams, pattern notation,
  and the notes heard during playback.
- Treat browser capabilities as part of the experience. Audio startup, microphone permission,
  interrupted sessions, and unavailable wake lock need understandable states and recovery.
- Continue using the existing standalone app and shared controls for coherent navigation,
  dialogs, notifications, and editing.

## Product invariants

- A song sheet owns its embedded patterns as snapshots. Editing the global pattern library
  does not silently change a saved sheet.
- Reusable musical parts and their ordered occurrences have distinct roles: musical content
  belongs to the part, occurrence-specific lyrics belong to the occurrence.
- Tuning, capo, chord modifiers, grips, rhythm, and playing techniques must retain their
  meaning through editing, saving, reloading, and playback.
- Opening or upgrading stored data must preserve user content through explicit migrations.
  Destructive maintenance actions must communicate their effect and require confirmation.
- Playback and microphone capture have separate lifecycles. Leaving or stopping a workflow
  releases the resources it owns.
- Normal practice data stays client-side. Adding a server, account, sync service, or external
  data transfer requires an explicit product requirement.

## Scope

The current product is a practice companion with local persistence, sampled audio, a service
worker, and a browser microphone tuner. Complete offline operation and export/import round trips
must be specified and verified before being promised; they are not established guarantees.

New product commitments should follow the user's request. A feature-specific decision does
not automatically become a rule for every future feature. Technical boundaries and source
locations are in [constraints.md](constraints.md) and [../docs/architecture.md](../docs/architecture.md).
