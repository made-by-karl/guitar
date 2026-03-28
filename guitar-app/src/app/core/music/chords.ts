import { Modifier } from '@/app/core/music/modifiers';
import { Semitone } from '@/app/core/music/semitones';

export interface Chord {
  root: Semitone;
  bass?: Semitone;
  modifiers: Modifier[];
}

export function chordEquals(a: Chord, b: Chord): boolean {
  return a.root === b.root && a.bass === b.bass &&
    a.modifiers.length === b.modifiers.length &&
    a.modifiers.every((m, i) => m === b.modifiers[i]);
}

export function chordToString(chord: Chord): string {
  const chordName = chord.root + (chord.modifiers.length ? chord.modifiers.join('') : '');
  // Only add bass if it's a valid non-null value
  if (!chord.bass) {
    return chordName;
  }
  // Extra safety check for string "null" that might come from form binding
  const bassStr = String(chord.bass);
  if (bassStr === 'null' || bassStr === 'undefined' || bassStr === '') {
    return chordName;
  }
  return `${chordName}/${chord.bass}`;
}
