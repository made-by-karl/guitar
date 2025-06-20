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

export function chordToString(chord: Chord): string {
  return chord.root + (chord.modifiers.length ? chord.modifiers.join('') : '');
}