import { Injectable } from '@angular/core';
import { SEMITONES, normalize, Semitone } from '../semitones';
import { Modifier } from '../modifiers';

export interface Chord {
  root: Semitone;
  modifiers: Modifier[];
}

export type HarmonicFunction =
  | 'Tonic'
  | 'Predominant'
  | 'Dominant'
  | 'Secondary Dominant';

export interface SuggestedChord {
  chord: Chord;
  degree: string;
  function: HarmonicFunction;
}

export interface Progression {
  chords: Chord[];
}

// --- Helper Data ---
const CHROMATIC: Semitone[] = [...SEMITONES];
const MAJOR_SCALE: number[] = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE: number[] = [0, 2, 3, 5, 7, 8, 10];
const MAJOR_TRIADS: Modifier[][] = [
  [], ['m'], ['m'], [], [], ['m'], ['dim']
];
const MINOR_TRIADS: Modifier[][] = [
  ['m'], ['dim'], [], ['m'], ['m'], [], []
];
const MAJOR_DEGREES = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const MINOR_DEGREES = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];
const MAJOR_FUNCTIONS: HarmonicFunction[] = [
  'Tonic', 'Predominant', 'Tonic', 'Predominant', 'Dominant', 'Tonic', 'Dominant'
];
const MINOR_FUNCTIONS: HarmonicFunction[] = [
  'Tonic', 'Predominant', 'Tonic', 'Predominant', 'Dominant', 'Tonic', 'Dominant'
];

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}
function semitoneIndex(s: Semitone): number {
  return SEMITONES.indexOf(s);
}
function enharmonic(s: Semitone): Semitone {
  return s;
}
function getScale(root: Semitone, isMinor: boolean): Semitone[] {
  const idx = semitoneIndex(root);
  const intervals = isMinor ? MINOR_SCALE : MAJOR_SCALE;
  return intervals.map(i => CHROMATIC[mod12(idx + i)]);
}
function getTriadQualities(isMinor: boolean): Modifier[][] {
  return isMinor ? MINOR_TRIADS : MAJOR_TRIADS;
}
function getDegreeNames(isMinor: boolean): string[] {
  return isMinor ? MINOR_DEGREES : MAJOR_DEGREES;
}
function getFunctions(isMinor: boolean): HarmonicFunction[] {
  return isMinor ? MINOR_FUNCTIONS : MAJOR_FUNCTIONS;
}
function isMinorChord(modifiers: Modifier[]): boolean {
  return modifiers.includes('m');
}
function chordEquals(a: Chord, b: Chord): boolean {
  return a.root === b.root &&
    a.modifiers.length === b.modifiers.length &&
    a.modifiers.every((m, i) => m === b.modifiers[i]);
}

@Injectable({ providedIn: 'root' })
export class ChordProgressionService {
  suggestChords(base: Chord): SuggestedChord[] {
    // Key detection
    if (!SEMITONES.includes(base.root)) return [];
    const isMinor = isMinorChord(base.modifiers);
    const scale = getScale(base.root, isMinor);
    const triads = getTriadQualities(isMinor);
    const degrees = getDegreeNames(isMinor);
    const functions = getFunctions(isMinor);
    const result: SuggestedChord[] = [];
    // Diatonic triads
    for (let i = 0; i < 7; i++) {
      // For minor keys, force the dominant (V) to be a 7th chord
      if (isMinor && i === 4) {
        result.push({
          chord: { root: scale[i], modifiers: ['7'] },
          degree: degrees[i],
          function: functions[i]
        });
      } else {
        result.push({
          chord: { root: scale[i], modifiers: triads[i] },
          degree: degrees[i],
          function: functions[i]
        });
      }
    }
    // Dominant 7th (already added for minor, so only add for major)
    if (!isMinor) {
      const Vidx = 4;
      const V7: Chord = { root: scale[Vidx], modifiers: ['7'] };
      result.push({ chord: V7, degree: degrees[4] + '7', function: 'Dominant' });
    }
    // Secondary dominants
    const secDomTargets = isMinor ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5];
    for (const idx of secDomTargets) {
      const target = scale[idx];
      const VofTarget = SEMITONES[mod12(semitoneIndex(target) + 7)];
      result.push({
        chord: { root: VofTarget, modifiers: ['7'] },
        degree: `V7/${degrees[idx]}`,
        function: 'Secondary Dominant'
      });
    }
    return result;
  }

  suggestProgressions(base: Chord, count?: number): Progression[] {
    const chords = this.suggestChords(base);
    const isMinor = isMinorChord(base.modifiers);
    const tonic = chords.find(c => c.function === 'Tonic')?.chord;
    const predominant = chords.find(c => c.function === 'Predominant')?.chord;
    const dominant = chords.find(c => c.function === 'Dominant')?.chord;
    if (!tonic || !predominant || !dominant) return [];
    const progressions: Progression[] = [];
    const n = count ?? 3;
    for (let i = 0; i < n; i++) {
      const prog: Chord[] = [base];
      // Random length 3-8
      const len = count ? count : 3 + Math.floor(Math.random() * 6);
      // Ensure at least one of each function
      prog.push(predominant);
      // Add random chords (avoid consecutive duplicates)
      while (prog.length < len - 2) {
        const last = prog[prog.length - 1];
        const candidates = chords.filter(c => !chordEquals(c.chord, last));
        candidates.sort((a, b) =>
          Math.abs(semitoneIndex(a.chord.root) - semitoneIndex(last.root)) -
          Math.abs(semitoneIndex(b.chord.root) - semitoneIndex(last.root))
        );
        prog.push(candidates[0].chord);
      }
      // Ensure dominant is present before the last tonic
      if (!prog.some(c => chordEquals(c, dominant))) {
        prog.push(dominant);
      }
      // End on tonic
      prog.push(tonic);
      progressions.push({ chords: prog });
    }
    return progressions;
  }
}
