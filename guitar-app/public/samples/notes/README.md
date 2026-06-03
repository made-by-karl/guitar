# Guitar Note Samples

## Source Attribution

These guitar note samples are sourced from the **Philharmonia Orchestra Sound Samples** collection, available at:
**https://philharmonia.co.uk/resources/sound-samples/**

I extend my sincere gratitude to the **Philharmonia Orchestra** for making these high-quality orchestral guitar samples freely available for creative and educational use.

## Sample Mapping

The app keeps a reduced set of guitar anchor samples and lets Tone.js pitch-shift them to cover the remaining notes. The retained anchors are the six standard-tuning open strings plus high E5.

The original files follow the naming pattern `guitar_<note>_very-long_forte_normal.mp3` and have been renamed for simplified use in the application.

### Included Samples

| App Filename | Original Philharmonia Filename | Note | Octave | Role |
|--------------|--------------------------------|------|--------|------|
| `guitar_E2.mp3` | `guitar_E2_very-long_forte_normal.mp3` | E | 2 | 6th string open |
| `guitar_A2.mp3` | `guitar_A2_very-long_forte_normal.mp3` | A | 2 | 5th string open |
| `guitar_D3.mp3` | `guitar_D3_very-long_forte_normal.mp3` | D | 3 | 4th string open |
| `guitar_G3.mp3` | `guitar_G3_very-long_forte_normal.mp3` | G | 3 | 3rd string open |
| `guitar_B3.mp3` | `guitar_B3_very-long_forte_normal.mp3` | B | 3 | 2nd string open |
| `guitar_E4.mp3` | `guitar_E4_very-long_forte_normal.mp3` | E | 4 | 1st string open |
| `guitar_E5.mp3` | `guitar_E5_very-long_forte_normal.mp3` | E | 5 | High-range anchor |

### Playback Coverage

- **Loaded samples**: 7 anchor notes
- **Playback range**: E2 through E5
- **Pitching strategy**: Tone.js chooses the nearest loaded sample and shifts it to the requested playback note
- **Primary use**: MIDI guitar playback in `src/app/core/services/midi.service.ts`

## Technical Notes

- All samples are recorded at **forte** dynamic level for consistent volume
- **Very-long** duration provides natural sustain and decay
- Original **normal** playing technique, with no special effects
- File naming follows `guitar_<note><octave>.mp3` convention
- Sharp notes use `s` suffix if added later, for example `Fs` for F# and `As` for A#
- Samples maintain their original audio quality and characteristics

## License

These samples are used under the terms provided by the Philharmonia Orchestra. Please refer to their website for specific usage guidelines and attribution requirements.
