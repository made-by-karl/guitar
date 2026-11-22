# Audio overview

Playback renders Tone.js instruments into HTML media: complete WAVs for short clips and
metronome loops, or incremental lossless FLAC in fragmented MP4 for long finite plans.
The tuner retains its independent microphone pipeline.

## Action articulation

`PlayingAction.articulation` is the single sound choice for strums and picks. Missing or
`normal` maps to the existing normal instructions; `mute` maps to `muted`, `palm-mute`
to `palm-muted`, and strum-only `dead-note` to `dead-note`. Accent remains independent
and changes velocity through the existing rule. Direction and range stay on the strum.
The planner and notation read only the canonical field. Legacy flags are converted at
versioned database/import boundaries, never interpreted as a second runtime sound choice.

Dead strums retain unpitched cross notation, no-grip playability, chosen range/direction,
and damping of prior guitar tails and sounding-string history. Ordinary Mute remains
pitched and does not acquire that damping behavior. This model/UI change does not alter
samples, processing profiles, gains, timing or rendered instruction meanings.

## Playback pipeline

`RenderedAudioService` prepares mono 44.1 kHz PCM. The complete-file strategy encodes
16-bit WAV with `WavEncoderService`; streaming encodes bounded PCM windows separately.
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
delegate to the same channel. Full-song Previous/Next actions use the same occurrence navigation as the page; unsupported
actions are ignored, and boundary requests do nothing. The most recently playing channel owns those controls;
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

## Incremental long playback

`StreamingAudioService` selects incremental preparation when the estimated duration,
including release, exceeds 15 seconds. Chord/grip and isolated-measure previews remain
complete WAVs; the standalone metronome retains its exact native WAV loop. There is
no user-facing backend setting. Both strategies use `HtmlAudioPlaybackService`, one
persistent media element per active channel and the same media clock/finite timeline.

The selected format is mono 44.1 kHz, 16-bit **FLAC in fragmented MP4**. AAC was evaluated
first: bundled Chromium lacked an AAC encoder, while the raw WebKit prototype exposed
encoder/presentation padding that required additional handling. Opus encoding/decoding
was available in both desktop engines, but lossless independent FLAC windows avoid
codec priming/state at musical and random-access boundaries and preserve sample counts.
`mediabunny` and `@mediabunny/flac-encoder` are pinned to 1.66.2 (MPL-2.0). The latter
bundles a local libFLAC WASM encoder; neither sends practice data to a server.
The shipped `licenses/streaming-audio.txt` preserves MPL/libFLAC notices and pinned source links. Encoding
runs in disposable workers, finalized/canceled after each window. See the maintained
[encoder documentation](https://mediabunny.dev/guide/extensions/flac-encoder) and
[fragmented MP4 output API](https://mediabunny.dev/guide/output-formats).

Capability detection proves encode, append, clock advancement and seek on a muted,
disposable media element before selecting a source. This probe does not claim system
controls or bypass the actual player's gesture/retry rules. Secure-context, worker/WASM,
codec or source failures retain complete-WAV playback. ManagedMediaSource is preferred
when its probe succeeds; ordinary MediaSource is also probed. Streaming elements set
`disableRemotePlayback`, satisfying ManagedMediaSource activation without an AirPlay
alternative. This opts those elements out of remote playback, independently of Media
Session/lock-screen controls. The WAV/metronome elements keep their existing behavior.

### Windows, gain and scheduling

The complete plain-data musical plan and notation timeline are retained from startup.
The first window covers four seconds; generation then aims for 24 seconds ahead of
actual media time. Each render includes earlier attacks whose hold, strum spread or
release can reach the requested interval, including pitch automation and dead-strum
chokes. The context origin is aligned to the full render's 128-sample quantum and the
result is cropped at exact integer sample positions. No whole-song PCM buffer or file
is prepared before streaming starts. A sustained voice needing over 30 seconds of
context exposes a recoverable complete-file retry rather than allocating an unbounded
window. Finite plans retain the existing approximately ten-minute limit.

A single plan-wide gain bounds articulated mixes using required sample peaks and
simultaneous voices. That fixed gain is applied to every window; there is no per-window
normalization or pumping. It can produce a more conservative overall level than the
legacy complete-WAV whole-buffer peak normalization, while preserving relative dynamics.
Clean plans keep the existing unity gain. PCM comparisons cover attacks crossing window
edges, slides/legato, percussion, damping, rests and final release, allowing only 16-bit
quantization tolerance. Musical/listening verification on physical output remains separate.

Offline jobs are serialized, bounded and ordered: interactive WAV previews/metronome
changes first, then seeks/imminent underruns, then speculative windows. Cancellation skips
queued allocation and prevents late render/encode work from starting audio or entering
fragment caches. A native offline render already underway still finishes and disposes.
An aborted consumer does not wait for that native work before reusing a cached seek.

Decoded samples and processed pitch/articulation buffers use a shared 16 MiB LRU; temporary
Tone wrappers/voices belong to each offline context. Encoded fragments use a separate
32 MiB LRU shared across finite sessions, alongside the existing 32 MiB WAV cache. Keys
include a SHA-256 identity of full musical/render inputs, score duration, sample revision,
codec/encoder configuration, gain, window bounds and render rate. Temporary window PCM
is not cached. Browser buffers are pruned to approximately eight seconds behind and
32 seconds ahead; their ownership is independent of encoded-cache eviction.

### Buffering, seeking and recovery

An exhausted stream reports **Buffering**, retaining an operable Pause/Stop and the frozen
media-clock notation position. Playing seeks resume through native media recovery; paused
seeks prepare their target without calling Play. Rapid/native/system seeks accept the
latest target on the existing element/session. Buffered seeks use actual `TimeRanges`;
cached unbuffered windows are reappended, while missing windows are prioritized. Managed
demand/eviction notifications wake the same range-based pump; generated audio is never
assumed still present in the browser buffer. Quota failure prunes ranges and retries once.

The initial duration includes a release estimate. Rendering the final window preserves
written rests, trims unused release padding and reconciles both media and Media Session
duration. Completion comes from native `ended`, after the actual release. The last owned
completed stream remains replayable, including reappend/regeneration of missing ranges.
Stop/navigation/replacement invalidate preparation, append work, retries, metadata ownership
and replay, pause output and revoke URLs. Cache eviction never revokes an active player URL.

Unrecoverable stream/native-media errors stop the source and expose an explicit Retry that
uses the complete-file strategy; there is no attempted seamless switch during playback.
Gesture rejection keeps prepared media ready for a direct Play action. A later pause or Stop
always wins over background preparation or an old play promise.

Issue [#29](https://github.com/made-by-karl/guitar/issues/29) was clarified during implementation:
foreground notation is primary, and stopping while locked is acceptable. Background
JavaScript/appending is not guaranteed. Interrupted playback must remain recoverable and
must not restart after Pause/Stop. No minimum iPhone/iOS version, Silent Mode behavior or
physical-device listening has been certified. Automated Chromium/WebKit checks, measurements,
raw evidence and the remaining device procedure are in
[testing.md](testing.md#incremental-streaming-playback-issue-29).

## Finite playback and ownership

`PlaybackService` supplies finite sessions and chord previews; `MidiService` supplies maintenance
and percussion previews. Pattern-library, sheet-local pattern, isolated measure, part/occurrence
and full-song callers use the same media path. Sessions in the existing finite-playback scope
still compete with each other; the metronome and one-shot channels retain separate ownership.

Finite sessions derive cursor/occurrence highlights from media `currentTime`, preserve the
same media timeline during pause/resume/seek, and finish on the actual `ended` event.
Rendering includes sequential spread and instrument release beyond the last musical event.
Finite WAVs and the final streaming window discard unused release padding after the final sample above the 16-bit PCM
noise floor, retaining 20 ms of silence after the decay. Trimming never shortens the
score duration (including final rests), and reported media duration matches the encoded
buffer. Native metronome loops retain their exact duration and repeating phase.
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
The main mix applies a peak ceiling to avoid clipping. Short output uses WAV and long output uses lossless streaming through
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
The Song/Parts playback pane and full-screen play view bind the resolved position stream
directly to the highlight directive. After the initial render, each discrete emission checks
only that drawing immediately, avoiding another coalesced application render before the marker
updates. Signal/value bindings remain available for editor previews. The directive releases
stream subscriptions with the view; neither binding advances or offsets media time.
Compact drawings follow each slot near the left edge, retaining up to two previous slots
(at most a quarter of the viewport) so upcoming notation gets most of the width. Scrolling
is immediate and local to the drawing, including seeks, resume and viewport resizing. At the
end of a score, the viewport stops at its natural scroll limit.

Finite sessions also expose `clock$`, with run identity and continuous samples of the same
media time. Discrete `state$` updates remain limited to transport/slot changes so continuous
progress does not rebuild notation or musical snapshots on every frame. The song service
forwards that clock and includes the planner's slot/start times and `notationDuration` in its
full-song sequence. `notationDuration` ends at the final written slot, excluding audio release.
The play view uses those values for grip/part progress; it adds no polling loop or timer.
Each upcoming grip countdown starts when the target first enters After next and retains
that same interval when it moves into Next. The two opening targets start at media time zero;
seeking or reopening the view derives the same intervals from the scheduled grip changes.

Full-song section seeks use the existing finite session's measure segment start times.
`SongPartPlaybackService` derives occurrence boundaries and navigation availability from
its scheduled rows, distinguishing repeated part IDs by occurrence identity. Each seek
synchronously publishes the accepted media position, so rapid requests use the preceding
request's target. No new render, media element, session or clock is created. Only actual
playing/paused media is seekable; prepared/rejected/error media awaits its recovery action.
