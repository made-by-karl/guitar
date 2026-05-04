import { Note } from '@/app/core/music/semitones';
import { formatNoteLabel, midiToNote } from '@/app/features/tuner/services/tuner-note-math';

export interface VisibleSemitoneMarker {
  midi: number;
  note: Note;
  label: string;
  offsetSemitones: number;
}

export function buildVisibleSemitoneMarkers(
  centerMidiFloat: number,
  radiusSemitones: number = 1.35
): VisibleSemitoneMarker[] {
  const startMidi = Math.floor(centerMidiFloat - radiusSemitones) - 1;
  const endMidi = Math.ceil(centerMidiFloat + radiusSemitones) + 1;
  const markers: VisibleSemitoneMarker[] = [];

  for (let midi = startMidi; midi <= endMidi; midi++) {
    const offsetSemitones = midi - centerMidiFloat;
    if (Math.abs(offsetSemitones) > radiusSemitones + 0.6) {
      continue;
    }

    const noteValue = midiToNote(midi);
    markers.push({
      midi,
      note: noteValue,
      label: formatNoteLabel(noteValue),
      offsetSemitones
    });
  }

  return markers;
}
