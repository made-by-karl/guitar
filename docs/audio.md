# Audio overview

Playback renders Tone.js instruments into WAV media, then plays through `HTMLAudioElement`.
The tuner retains its independent microphone pipeline.

## Playback pipeline

`RenderedAudioService` prepares a mono 44.1 kHz, PCM 16-bit WAV with `WavEncoderService`.
It uses an explicit `Tone.OfflineContext`, so preparation does not redirect Tone's global
context or send a second copy to a live Web Audio destination. Only banks required by the
instructions are loaded, with 20-second loading deadlines and cancellation checks between banks. Temporary samplers, decoded slide anchors, independent slide
voices and the offline context are disposed after rendering, including failures.

This builds on `feature/wavAudioOutput` at `fa87307`, reconciled with current main rather than
merging the old scheduling and slide implementation. `midi-renderer.ts` schedules parallel,
sequential and reversed guitar notes, target-only hammer-ons/pull-offs, percussion and
continuous exponential playback-rate slides. Every `legatos` voice remains independent.
Open-string handling and sounding-string history stay in the existing planner.

`HtmlAudioPlaybackService` owns a media element and blob URL per channel. Each replacement
uses a fresh element; generation checks and abort signals invalidate stopped, destroyed or
superseded work. A late play promise only pauses its own old element. Stop removes the source,
reloads the element and revokes its URL. Ended/error events, interruptions and explicit
pause/resume drive state; focus/visibility events never restart a stopped media player.

The shared playback controls show Preparing, Starting, Playing, Paused, errors and explicit
Play/Retry/Stop actions. Preparation does not count as Playing. If a browser rejects playback
after asynchronous rendering, the prepared source stays available: Play calls `audio.play()`
directly from the next interaction. There is no silent helper track, microphone request,
output-backend setting or automatic retry. The controls remain above modal overlays.
Navigation stops media and pending preparation; custom-grip modal previews also have an
individual owner released on destruction.

This media path is intended to address the iPhone Silent Mode requirement in issue #4.
[WebKit's report](https://bugs.webkit.org/show_bug.cgi?id=237322) describes the media/Web Audio
session distinction, and its [media policy](https://webkit.org/blog/6784/new-video-policies-for-ios/)
explains gesture restrictions. Neither WAV encoding nor desktop emulation certifies iPhone
behavior. Real-device verification remains required; no minimum iOS version or background/
lock-screen continuation is promised by this implementation.

## Finite playback and ownership

`PlaybackService` supplies finite sessions and chord previews; `MidiService` supplies maintenance
and percussion previews. Pattern-library, sheet-local pattern, isolated measure, part/occurrence
and full-song callers use the same media path. Sessions in the existing finite-playback scope
still compete with each other; the metronome and one-shot channels retain separate ownership.

Finite sessions derive cursor/occurrence highlights from media `currentTime`, preserve the
same rendered waveform during pause/resume/seek, and finish on the actual `ended` event.
Rendering includes sequential spread and instrument release beyond the last musical event.
Stop cuts the release immediately. Input changes alter the render identity through complete
instruction data; tuning, capo, ordered notes, dynamics and legato endpoints therefore travel
with the plan rather than relying on a stale cached song/pattern ID.

## Rendering limits and cache

- Rendered blobs use a 32 MiB LRU byte budget. Oversized results are usable without being cached.
- Identical in-flight renders share one job. Canceling one consumer does not cancel another.
- At most eight distinct renders may be queued/in flight; extra requests report a retryable busy error.
  Offline work is serialized to bound concurrent render allocations. Canceled queued jobs skip
  allocation, and running work checks cancellation before rendering and encoding. A native
  offline render already in progress cannot be forcibly interrupted; it is disposed on completion
  and its canceled result never starts playback or enters the cache.
- Individual renders accept approximately ten minutes including release allowance. Larger plans
  produce a recoverable error suggesting section playback. A five-minute mono WAV is about
  26.7 MB; a native render also temporarily holds its float buffer and decoded source samples.
- The cache stores blobs, never player URLs. Active and paused media own their URLs independently,
  so eviction cannot revoke audio still in use. Stop/destruction releases those owners.
- `MIDI_SAMPLE_SET_VERSION`, full instructions, duration and render sample rate form the cache
  identity. Bump the sample version when replacing or remapping recordings.

## Palm-muted bank

Palm-muted picks and all strings of palm-muted strums use `/samples/palm-muted/*.wav`.
Clean notes and existing percussion/metronome recordings remain unchanged. The planner keeps
articulation when accent increases velocity; `mute` still wins over `palm-mute`. Palm mute no
longer uses fixed `0.8 s` duration / `0.7` velocity as its articulation mechanism.

Per the implementation request, the shipped bank is a **temporary synthetic placeholder**.
It is not a recorded palm-muted guitar and has no listening acceptance. See the
[bank README](../guitar-app/public/samples/palm-muted/README.md) for all seven pitched anchor
filenames, metadata, provenance and replacement instructions. Nearest-anchor pitch shifting
also covers generated notes below E2 and above E5; recordings and extreme transpositions need
listening checks. Missing required WAVs fail preparation without a clean-note fallback.
The service worker prefetches WAV and retained MP3 samples with content hashes.

## Metronome

The metronome renders four measures into a native media loop. Additional pre-roll supplies
previous-hit decay; it is cropped from the output so both ends have the same repeating phase.
Beat labels and animation use the media clock rather than a live Tone transport.

A running configuration change renders while the old loop remains audible. The latest prepared
change switches at the next old tick boundary. Tempo-only changes preserve the beat index;
meter/subdivision changes start on the new downbeat. The old configuration stays displayed while it is audible; the new configuration becomes selected
when the replacement media is ready, and Running is set only when it actually plays. Changes
to interrupted/paused playback prepare a replacement and wait for an explicit Play/Resume. Failure during rendering retains the old loop and reports an error;
a rejected replacement start stops output and exposes its prepared Play action. Stop, navigation
and newer changes invalidate pending renders and boundary callbacks. Exact audible handoff
quality and seam perception still need device/listening checks.

## Tuner Pipeline

The tuner does not use Tone.js for capture. It has its own browser-audio path:

- `TunerAudioSession` requests microphone access, creates an `AudioContext`, attaches an `AnalyserNode`, and tracks interruption events.
- `TunerService` owns the frame loop, startup/stop lifecycle, and debug export.
- `tuner-detector.ts` performs frame-level pitch detection.
- `tuner-tracker.ts` applies multi-frame acceptance and correction logic.
- `tuner-state-projection.ts` converts accepted tracking state into UI-facing display values.

Read `docs/tuner/README.md` before changing tuner detection or tracking behavior.

## Verification

`bash scripts/verify.sh` covers unit tests and production build. The focused browser spec is
`e2e/media-playback.spec.ts`; it checks real WAV decode/nonzero signal, media time, preparation
retry, required sample failures, finite transport, metronome loop boundaries and cancellation.
Unit mocks preserve musical regressions but cannot establish audible quality. See
[testing.md](testing.md#media-playback-and-iphone-verification) for the device procedure and
remaining acceptance work.
