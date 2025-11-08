import { Modifier } from "./modifiers";
import { Semitone } from "./semitones";

export interface Chord {
  root: Semitone;
  modifiers: Modifier[];
}

export function chordEquals(a: Chord, b: Chord): boolean {
  return a.root === b.root &&
    a.modifiers.length === b.modifiers.length &&
    a.modifiers.every((m, i) => m === b.modifiers[i]);
}

export function chordToString(chord: Chord, bass?: Semitone | null): string {
  const chordName = chord.root + (chord.modifiers.length ? chord.modifiers.join('') : '');
  // Only add bass if it's a valid non-null value
  if (!bass || bass === null) {
    return chordName;
  }
  // Extra safety check for string "null" that might come from form binding
  const bassStr = String(bass);
  if (bassStr === 'null' || bassStr === 'undefined' || bassStr === '') {
    return chordName;
  }
  return `${chordName}/${bass}`;
}