# Feature: Advanced MIDI Generation and Playback

## Overview
This feature overhauls the MIDI generation and playback system for the guitar app, enabling expressive, accurate, and real-time guitar rhythm playback. The new system must support:
- Realistic guitar sounds (including muted and palm-muted strings)
- Percussive effects (body hits, taps, etc.)
- Flexible, programmatic MIDI sequence creation from the app's rhythm pattern model
- On-the-fly playback in the browser

## State-of-the-Art Library Recommendation
**Tone.js** is recommended as the core library for real-time MIDI/audio generation and playback. Tone.js is a modern, actively maintained Web Audio framework with:
- High-level scheduling and transport (DAW-like)
- Polyphonic and monophonic synths, samplers, and effects
- Support for custom samples (for realistic guitar, muted, palm-muted, and percussive sounds)
- Fine-grained control over timing, velocity, envelopes, and effects
- TypeScript support and a large user base

**Alternative:** For pure MIDI file export, consider MidiWriterJS or JSMidi, but for real-time playback and guitar realism, Tone.js is superior.

## Requirements

### 1. Library Integration
- Integrate Tone.js via npm (`npm install tone`)
- Use `Tone.Sampler` to load and play guitar, muted, palm-muted, and percussive samples
- Ensure all samples are license-compliant and optimized for web use

### 2. MIDI Service API
- The new `MidiService` must provide:
  - `playSequence(instructions: MidiInstruction[]): Promise<void>`
    - Where `MidiInstruction` encodes note, velocity, duration, instrument/sample, and timing
  - `generateFromRhythmPattern(pattern: RhythmPattern, tempo: number, ...): MidiInstruction[]`
    - Converts the app's rhythm pattern model (including techniques, modifiers, and beat/timing data) into a sequence of MIDI instructions
- The service must:
  - Support polyphony (multiple notes at once)
  - Support velocity/dynamics (for accents)
  - Support sample switching (normal, muted, palm-muted, percussive)
  - Support per-step timing (beat, subdivision, duration)
  - Allow for future extension (e.g., slides, harmonics)

### 3. Guitar Sound Realism
- Use high-quality guitar samples for:
  - Open/normal notes
  - Muted notes ("chick" sound)
  - Palm-muted notes (short, damped)
  - Percussive hits (body tap, string slap, etc.)
- Map rhythm pattern techniques/modifiers to the correct sample and velocity
- Allow for custom sample sets (user can swap in their own)

### 4. Percussion Support
- Use additional samples or synths for percussive steps (e.g., body hit, tap)
- Allow mapping of percussive steps to drum sounds if desired

### 5. Timing and Synchronization
- Use Tone.js Transport for precise scheduling
- All events must be sample-accurate and tempo-synchronized
- Support for tempo changes and swing/shuffle in the future

### 6. Extensibility
- The system must be modular and allow for:
  - Additional guitar techniques (slides, harmonics, etc.)
  - Additional instruments (bass, ukulele)
  - Export to MIDI file (future)

### 7. UI/UX
- Playback must be responsive and low-latency
- Errors in sample loading or playback must be handled gracefully
- Provide visual feedback during playback (highlighting steps, etc.)

## Out of Scope
- Full MIDI file import/export (future)
- Advanced audio effects (reverb, delay, etc.) beyond basic needs

## References
- [Tone.js Documentation](https://tonejs.github.io/docs/)
- [Tone.js Sampler Example](https://tonejs.github.io/examples/#sampler)
- [Guitar Sample Packs](https://freesound.org/search/?q=guitar+mute)
- [Web Audio API](https://webaudio.github.io/web-audio-api/)

---
**Summary:**
- Use Tone.js for all real-time MIDI/audio playback
- Use high-quality samples for guitar, mute, palm-mute, and percussion
- Expose a flexible API for playing sequences and converting rhythm patterns to MIDI instructions
- Ensure extensibility and future-proofing for more advanced guitar techniques and instruments
