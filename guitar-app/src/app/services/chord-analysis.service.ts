import { Injectable } from "@angular/core";

export type ChordAnalysis = {
  root: string;
  bass?: string;
  modifiers: string[];
  notes: string[];
};

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

  public calculateNotes(root: string, modifiers: string[], bass?: string): ChordAnalysis {
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

    // Add default major triad if no modifiers
    if (modifiers.length === 0) {
      add('3');  // Major third
      add('5');  // Perfect fifth
    }

    // Process each modifier to build up intervals
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
    for (const mod of modifiers) {
      switch (mod) {
        case 'ø7':
          add('b3'); add('b5'); add('b7');
          break;
        case 'dim7':
          add('b3'); add('b5'); add('6');
          break;
        case 'dim':
          add('b3'); add('b5');
          break;
        case 'aug7':
          add('3'); add('#5'); add('b7');
          break;
        case 'aug':
          add('3'); add('#5');
          break;
        case 'maj7':
          add('3'); add('5'); add('7');
          break;
        case 'maj9':
          add('3'); add('5'); add('7'); add('9');
          break;
        case 'm7':
          add('b3'); add('5'); add('b7');
          break;
        case 'm':
          add('b3'); add('5');
          break;
        case '7':
          add('3'); add('5'); add('b7');
          break;
        case 'sus2':
          remove(['3', 'b3']); add('2'); add('5');
          break;
        case 'sus4':
          remove(['3', 'b3']); add('4'); add('5');
          break;
        case 'b5':
          remove(['5']); add('b5');
          break;
        case '#5':
          remove(['5']); add('#5');
          break;
        case 'bb5':
          remove(['5']); add('4');
          break;
        case 'add9':
          add('3'); add('5'); add('9');
          break;
        case 'add11':
          add('3'); add('5'); add('11');
          break;
        case 'add13':
          add('3'); add('5'); add('13');
          break;
        case 'b9':
          add('b9');
          break;
        case '#9':
          add('#9');
          break;
        case '#11':
          add('#11');
          break;
        case 'b13':
          add('b13');
          break;
        case 'no3':
          remove(['3', 'b3']);
          break;
        case 'no5':
          remove(['5', 'b5', '#5']);
          break;
        case 'no7':
          remove(['7', 'b7']);
          break;
      }
    }

    const allNotes = [...intervals].filter(i => !suppress.has(i)).map(i => this.transpose(root, i));
    const notes = bass && !allNotes.includes(bass)
      ? [bass, ...allNotes.filter(n => n !== bass)]
      : allNotes;

    return { root, bass, modifiers, notes };
  }

  public parseChord(input: string): ChordAnalysis {
    const [mainPart, bassRaw] = input.split('/');
    const bass = bassRaw ? this.normalize(bassRaw) : undefined;

    const rootMatch = mainPart.match(/^([A-G][b#]?)/);
    if (!rootMatch) throw new Error('Invalid chord root');
    const root = this.normalize(rootMatch[1]);
    let rest = mainPart.slice(root.length);

    const modifiers: string[] = [];
    const patterns: [RegExp, string][] = [
      [/^ø7/, 'ø7'],
      [/^dim7|°7/, 'dim7'],
      [/^dim|°/, 'dim'],
      [/^aug7/, 'aug7'],
      [/^aug|\+/, 'aug'],
      [/^maj7/, 'maj7'],
      [/^maj9/, 'maj9'],
      [/^m7/, 'm7'],
      [/^m/, 'm'],
      [/^7/, '7'],
      [/^sus2/, 'sus2'],
      [/^sus4/, 'sus4'],
      [/^b5/, 'b5'],
      [/^#5/, '#5'],
      [/^bb5/, 'bb5'],
      [/^add9/, 'add9'],
      [/^add11/, 'add11'],
      [/^add13/, 'add13'],
      [/^b9/, 'b9'],
      [/^#9/, '#9'],
      [/^#11/, '#11'],
      [/^b13/, 'b13'],
      [/^no3/, 'no3'],
      [/^no5/, 'no5'],
      [/^no7/, 'no7'],
    ];

    while (rest.length > 0) {
      let matched = false;
      for (const [regex, mod] of patterns) {
        const match = rest.match(regex);
        if (match) {
          modifiers.push(mod);
          rest = rest.slice(match[0].length);
          matched = true;
          break;
        }
      }
      if (!matched) break;
    }

    return this.calculateNotes(root, modifiers, bass);
  }
}
