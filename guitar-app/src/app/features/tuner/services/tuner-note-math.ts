import { Note, note, SEMITONES } from '@/app/core/music/semitones';

const A4_MIDI = 69;
const A4_FREQUENCY_HZ = 440;

export function frequencyToMidiFloat(frequencyHz: number): number {
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) {
    throw new Error(`Invalid frequency: ${frequencyHz}`);
  }

  return A4_MIDI + 12 * Math.log2(frequencyHz / A4_FREQUENCY_HZ);
}

export function midiToFrequency(midi: number): number {
  return A4_FREQUENCY_HZ * Math.pow(2, (midi - A4_MIDI) / 12);
}

export function midiToNote(midi: number): Note {
  const rounded = Math.round(midi);
  const semitoneIndex = ((rounded % 12) + 12) % 12;
  const octave = Math.floor(rounded / 12) - 1;
  return note(SEMITONES[semitoneIndex], octave);
}

export function formatNoteLabel(value: Note): string {
  return `${value.semitone}${value.octave}`;
}

export function getNearestMidi(frequencyHz: number): number {
  return Math.round(frequencyToMidiFloat(frequencyHz));
}

export function getCentsOffset(frequencyHz: number, nearestMidi: number = getNearestMidi(frequencyHz)): number {
  return (frequencyToMidiFloat(frequencyHz) - nearestMidi) * 100;
}

export function getSemitoneOffset(frequencyHz: number, nearestMidi: number = getNearestMidi(frequencyHz)): number {
  return frequencyToMidiFloat(frequencyHz) - nearestMidi;
}
