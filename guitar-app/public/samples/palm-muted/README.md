# Palm-muted bank — temporary placeholders

These WAV files are **synthetic development placeholders**, not recorded palm-muted guitar.
The user will record replacement samples later. Their sound has no listening acceptance.
They deliberately occupy a separate bank so picks, strums and accents can be verified now.
There is no silent fallback to the clean guitar bank when a required WAV fails to load.

## Replacement contract

Replace each file below with a recording of the named concert pitch, retaining its filename,
or update the palm-muted mapping in `guitarUrls` in `rendered-audio.service.ts` when selecting
another mapping, leaving the clean anchors unchanged. Keep a separate clean bank. Trim leading silence while preserving the pluck
and natural decay, balance perceived level with clean notes, and avoid clipping/clicks.
Bump `MIDI_SAMPLE_SET_VERSION` in `midi-renderer.ts` whenever assets or mapping change.
Record microphone/instrument/tuning, original filenames, licensing/ownership, recording format,
trimming/gain processing, output metadata and listening approval here with the real recordings.

The anchors are the six standard open strings plus E5. Tone.Sampler chooses the nearest
anchor and changes playback rate for every other requested pitch, including below E2 and
above E5; this does not impose an E2–E5 limit on alternate tuning, capo or fretted notes.
Extreme extrapolation and the eventual recordings require listening checks.

## Placeholder provenance and format

Generated locally for this task using Python stdlib `wave`, `math` and `struct`; no external
recordings were used and there are no third-party recording rights associated with these files.
Frequency is `440 * 2**((midi-69)/12)`; waveform is a sine plus a 20% second harmonic,
scaled by 0.55 with a 3 ms attack, `exp(-12*t)` decay and a final 20 ms fade. Samples are
rounded to signed 16-bit PCM. The placeholder is intentionally audible and pitched.

| File | Pitch | Rate | Channels | Encoding | Duration | Bytes |
| --- | --- | --- | --- | --- | --- | --- |
| `guitar_E2.wav` | E2 | 24000 Hz | 1 | PCM 16-bit | 0.600 s | 28844 |
| `guitar_A2.wav` | A2 | 24000 Hz | 1 | PCM 16-bit | 0.600 s | 28844 |
| `guitar_D3.wav` | D3 | 24000 Hz | 1 | PCM 16-bit | 0.600 s | 28844 |
| `guitar_G3.wav` | G3 | 24000 Hz | 1 | PCM 16-bit | 0.600 s | 28844 |
| `guitar_B3.wav` | B3 | 24000 Hz | 1 | PCM 16-bit | 0.600 s | 28844 |
| `guitar_E4.wav` | E4 | 24000 Hz | 1 | PCM 16-bit | 0.600 s | 28844 |
| `guitar_E5.wav` | E5 | 24000 Hz | 1 | PCM 16-bit | 0.600 s | 28844 |
