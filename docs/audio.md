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

The [Media Session API](https://www.w3.org/TR/mediasession/) supplies the playback label, app name, original 1024px artwork and
media position to system/lock-screen controls. Play, Pause, Stop and supported seek actions
delegate to the same channel. The most recently playing channel owns those controls;
when it stops or finishes while another channel plays, ownership returns to that channel.
Unsupported actions/position reporting do not block playback.

On natural completion, the app transport returns to idle, but the last system-owned clip
retains its media element and blob URL for lock-screen Play to replay from zero without
rendering again. Its finite plan remains available so highlights and transport follow replay.
Only one completed clip is retained; another playing clip, explicit Stop, navigation and
destruction release it. Stop also clears system metadata, position and handlers when no
other channel is playing. iOS controls the visibility of its recent-media card; clearing
the session cannot guarantee immediate dismissal. Device checks are still required.

Playback feedback is a per-page route choice through `data.playbackControls`:

- `overlay`: full floating Preparing/Starting/Playing/Paused and Play/Retry/Stop controls.
  Enabled on `/maintenance/midi-test`.
- `inline` (default): ordinary playback stays quiet; an inline Play/Retry message appears
  only for prepared audio awaiting interaction or errors. Normal page transport controls remain.
- `none`: the page provides all feedback/recovery itself; no shell panel is mounted.

`MediaPlaybackControlsComponent` only displays state and delegates user actions. It does not
own or stop audio when created/destroyed. Inline controls can be reused with a `channels`
input to limit them to a dialog's player. Audio dialogs expose these in their footer, while
the shell's inline message is hidden when a dialog is open, keeping recovery reachable inside it.

Preparation does not count as Playing. If a browser rejects playback after asynchronous
rendering, the prepared source stays available: Play calls `audio.play()` directly from the
next interaction. There is no silent helper track, microphone request, output-backend setting
or automatic retry. AppComponent owns navigation/destruction cleanup independently of the
chosen presentation; navigation stops media and pending preparation even when no panel is
mounted. Custom-grip modal previews retain their individual destruction cleanup.

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
- The cache stores blobs, never player URLs. Active, paused and the last completed media own their URLs independently,
  so eviction cannot revoke audio still in use. Stop/destruction releases those owners.
- `MIDI_SAMPLE_SET_VERSION`, full instructions, duration and render sample rate form the cache
  identity. Bump the sample version when replacing or remapping recordings.

## Palm mute and dead strums

Both articulations use the original clean guitar MP3 anchors. The synthetic palm-muted WAV
bank and temporary comparison UI/assets have been removed. The listening selections are A
for palm mute (320 ms decay, 2400 Hz low-pass tail) and final C for dead strums (85 ms decay,
900 Hz tail, 12 ms between strings, +3 dB). The cutoff retains a pitch-relative floor so high
notes stay audible. These are processed guitar sounds, not recorded dead-note percussion.

`guitar-articulation.ts` transposes each required note before applying its own filter/envelope
in a short offline render. Prepared voices are reused by pitch/articulation within the main
render job. Attack energy is calibrated per pitched voice; velocity retains accent dynamics.
The main mix applies a peak ceiling to avoid clipping. All output still uses WAV media and
the existing HTML audio lifecycle; no live Web Audio output is introduced.

Strum actions have optional `strum.mode`: `normal` (also the default when absent) or
`dead-note`. The shared measure editor exposes Mode alongside direction and string range.
Dead mode uses the selected open-string pitches from the current tuning, including strings
marked x in a grip, and works without a grip. It keeps up/down order and displays x marks.
Accent remains available; dead mode takes precedence over imported Mute/Palm mute flags.
Ordinary strums/picks keep the existing Mute-over-Palm-mute precedence.

A dead strum damps the previous guitar sound and clears all sounding-string history. Earlier
voices, release tails and delayed strum notes are bounded at that action, so subsequent
slides/pull-offs cannot inherit a muted source. Later explicit notes play normally.
Mode survives library/sheet snapshots and JSON/backup round trips without a storage reset.

Required source failures produce recoverable preparation errors. Render identity includes
instructions, strum mode resolved into technique, damping boundaries and a bumped
`MIDI_SAMPLE_SET_VERSION`. Source files remain covered by the service-worker MP3 rules.

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

## Song notation position

The pattern planner includes an ordered `slots` timeline (`time`, `segmentIndex`, local
`actionIndex`) alongside its instructions. Every defined slot is included, even when its
action is null or its measure is a rest. Internal strum attacks and legato voices do not
create extra visual positions. Preceding preview history establishes musical state without
adding time or positions to the requested scope.

Finite sessions map `HTMLAudioElement.currentTime` to that timeline on animation frames and
media events. Boundary comparisons allow one microsecond for media seek quantization
(for example at 180 BPM). They emit only when the transport or notated position changes; no elapsed-time
counter or queue of action callbacks drives the display. A delayed foreground frame catches
up directly to media time. Preparation, rejected startup and errors have no action marker.
Pause/seek use the media position, resume retains it, and the last slot remains through the
rendered release until `ended`. Stop/replacement/destruction invalidate preparation, media
events and frame loops; pause also invalidates its frame loop before resuming.

`SongPartPlaybackService` maps each segment to a copied musical snapshot with its part,
measure, local measure index, occurrence identity/number and preceding notation history.
The run ID changes on a new playback request. The source identifies Song, Parts or editor
ownership so editor drafts and saved playback cannot accidentally share a presentation. A stable
`sequence` contains the full scheduled musical snapshot for continuous drawing. Timing is
independent of presentation: `PlaybackHighlightView` accepts resolved notated positions,
and the binding directive delivers/clears them without starting a timer or controlling audio.

Controlled tests cover boundaries at 60/120/180 BPM and a three-minute plan. The browser
fixture records foreground DOM boundaries against actual media time. These measurements do
not establish the issue #5 target of visual boundaries within 50 ms of heard audio on a
physical speaker/wired output; synchronized screen/audio capture and listening remain required.

The continuous notation renderer indexes actions, measure coordinates and SVG segments from
its immutable score inputs. Angular OnPush detection keeps media frame polling from repeatedly
checking an unchanged score. Position updates reuse those indexes and preserve the drawing's
DOM across boundaries; only the highlight and local horizontal viewport follow playback.
