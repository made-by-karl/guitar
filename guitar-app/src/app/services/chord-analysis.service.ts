/**
 * Chord Analysis Service
 * This service provides functionality to parse and analyze guitar chords.
 * It can identify the root note, bass note, modifiers, and the notes that make up the chord.
 * 
 * Supported
 * Basic triads: maj, m, dim, aug
 * Sevenths: 7, maj7, m7, dim7, mMaj7, aug7
 * Suspensions: sus2, sus4
 * Extensions: add9, add11, add13
 * Alterations: b5, #5, b9, #9, #11, b13
 * Slash chords (bass note)
 */

import { Injectable } from "@angular/core";

export type ChordAnalysis = {
  root: string;
  bass?: string;
  modifiers: string[];
  notes: string[];
};

@Injectable({
  providedIn: 'root'
})
export class ChordAnalysisService {
  readonly SEMITONES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  readonly FLAT_EQUIVS: Record<string, string> = {
    'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B',
  };
  private readonly NOTE_MAP = Object.fromEntries(this.SEMITONES.map((n, i) => [n, i]));

  private normalize(note: string): string {
    return this.FLAT_EQUIVS[note] || note;
  }

  private transpose(root: string, semitones: number): string {
    const idx = this.NOTE_MAP[this.normalize(root)];
    return this.SEMITONES[(idx + semitones + 12) % 12];
  }

  // Maps the "chord formula" to intervals, i.e. C: root-3-5 = C-E-G or Cmaj7: root-3-5-7 = C-E-G-B
  readonly INTERVALS: Record<string, number> = {
    '1': 0, 'b2': 1, '2': 2, '#2': 3,
    'b3': 3, '3': 4, '4': 5, '#4': 6, 'b5': 6,
    '5': 7, '#5': 8, '6': 9, 'b7': 10, '7': 11,
    'b9': 13, '9': 14, '#9': 15, '11': 17, '#11': 18,
    'b13': 20, '13': 21,
  };

  public parseChord(input: string): ChordAnalysis {
    const [mainPart, bassRaw] = input.split('/');
    const bass = bassRaw ? this.normalize(bassRaw) : undefined;

    const rootMatch = mainPart.match(/^([A-G][b#]?)/);
    if (!rootMatch) throw new Error('Invalid chord root');
    const root = this.normalize(rootMatch[1]);
    let rest = mainPart.slice(root.length);

    const modifiers: string[] = [];
    const intervals: Set<number> = new Set([this.INTERVALS['1']]);
    const suppress: Set<number> = new Set();

    const add = (label: string) => {
      const st = this.INTERVALS[label];
      if (st !== undefined) intervals.add(st);
    };

    const remove = (labels: string[]) => {
      for (const label of labels) {
        const st = this.INTERVALS[label];
        if (st !== undefined) suppress.add(st);
      }
    };

    // Handle the chord modifiers
    // ø7: lower the 3rd and lower the 5th and 7th
    // dim: lower the 3rd and lower the 5th
    // dim7: lower the 3rd and lower the 5th and double-lower the 7th
    // sus2: replace the 3rd with the 2nd
    // sus4: replace the 3rd with the 4th
    // aug: raise the 5th
    // aug7: raise the 5th and lower the 7th
    // m: lower the 3rd
    // 7: lower the 7th
    // maj: raise the 3rd
    // maj7: raise the 3rd and raise the 7th
    const patterns: [RegExp, () => void][] = [
      [/^ø7/, () => { modifiers.push('ø7'); add('b3'); add('b5'); add('b7'); }],
      [/^dim7|°7/, () => { modifiers.push('dim7'); add('b3'); add('b5'); add('6'); }],
      [/^dim|°/, () => { modifiers.push('dim'); add('b3'); add('b5'); }],
      [/^aug7/, () => { modifiers.push('aug7'); add('3'); add('#5'); add('b7'); }],
      [/^aug|\+/, () => { modifiers.push('aug'); add('3'); add('#5'); }],
      [/^maj7/, () => { modifiers.push('maj7'); add('7'); }],
      [/^maj9/, () => { modifiers.push('maj9'); add('7'); add('9'); }],
      [/^m7/, () => { modifiers.push('m7'); add('b3'); add('5'); add('b7'); }],
      [/^m/, () => { modifiers.push('m'); add('b3'); add('5'); }],
      [/^7/, () => { modifiers.push('7'); add('3'); add('5'); add('b7'); }],
      [/^sus2/, () => { modifiers.push('sus2'); remove(['3', 'b3']); add('2'); add('5'); }],
      [/^sus4/, () => { modifiers.push('sus4'); remove(['3', 'b3']); add('4'); add('5'); }],
      [/^b5/, () => { modifiers.push('b5'); remove(['5']); add('b5'); }],
      [/^#5/, () => { modifiers.push('#5'); remove(['5']); add('#5'); }],
      [/^bb5/, () => { modifiers.push('bb5'); remove(['5']); add('4'); }],
      [/^add9/, () => { modifiers.push('add9'); add('9'); }],
      [/^add11/, () => { modifiers.push('add11'); add('11'); }],
      [/^add13/, () => { modifiers.push('add13'); add('13'); }],
      [/^b9/, () => { modifiers.push('b9'); add('b9'); }],
      [/^#9/, () => { modifiers.push('#9'); add('#9'); }],
      [/^#11/, () => { modifiers.push('#11'); add('#11'); }],
      [/^b13/, () => { modifiers.push('b13'); add('b13'); }],
      [/^no3/, () => { modifiers.push('no3'); remove(['3', 'b3']); }],
      [/^no5/, () => { modifiers.push('no5'); remove(['5', 'b5', '#5']); }],
      [/^no7/, () => { modifiers.push('no7'); remove(['7', 'b7']); }],
    ];

    while (rest.length > 0) {
      let matched = false;
      for (const [regex, action] of patterns) {
        const match = rest.match(regex);
        if (match) {
          action();
          rest = rest.slice(match[0].length);
          matched = true;
          break;
        }
      }
      if (!matched) break;
    }

    const allNotes = [...intervals].filter(i => !suppress.has(i)).map(i => this.transpose(root, i));
    const notes = bass && !allNotes.includes(bass)
      ? [bass, ...allNotes.filter(n => n !== bass)]
      : allNotes;

    return { root, bass, modifiers, notes };
  }
}
