import { Injectable } from "@angular/core";
import { Semitone } from 'app/common/semitones';
import { Modifier, areModifiersValid } from 'app/common/modifiers';
import { normalize, transpose } from 'app/common/semitones';

export type ChordAnalysis = {
  root: Semitone;
  bass?: Semitone;
  modifiers: Modifier[];
  notes: Semitone[];
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

  // Maps the "chord formula" to SEMITONES, i.e. C = C-E-G: root-3-5 => [0, 4, 7]
  readonly INTERVALS: Record<string, number> = {
    '1': 0, 'b2': 1, '2': 2, '#2': 3,
    'b3': 3, '3': 4, '4': 5, '#4': 6, 'b5': 6,
    '5': 7, '#5': 8, '6': 9, 'b7': 10, '7': 11,
    'b9': 13, '9': 14, '#9': 15, '11': 17, '#11': 18,
    'b13': 20, '13': 21,
  };

  public calculateNotes(root: Semitone, modifiers: Modifier[], bass?: Semitone): ChordAnalysis {
    const modifiersValid = areModifiersValid(modifiers);
    if (modifiersValid !== true) {
      throw new Error(`Invalid modifier combination: ${modifiersValid}`);
    }

    // Start with the basic triad intervals
    const intervals: Set<number> = new Set([this.INTERVALS['1'], this.INTERVALS['3'], this.INTERVALS['5']]);
    const suppress: Set<number> = new Set();

    const add = (label: string) => {
      const st = this.INTERVALS[label];
      if (st !== undefined) intervals.add(st);
    };

    const remove = (labels: string | string[]) => {
      if (typeof labels === 'string') {
        labels = [labels];
      }

      for (const label of labels) {
        const st = this.INTERVALS[label];;
        if (st !== undefined) suppress.add(st);
      }
    };

    const flatten = (label: string) => {
      const stRemove = this.INTERVALS[label];
      const stAdd = this.INTERVALS[label] -1;

      if (stRemove !== undefined && stAdd !== undefined && stAdd >= 0) {
        suppress.add(stRemove);
        intervals.add(stAdd)
      } 
    };

    const sharpen = (label: string) => {
      const stRemove = this.INTERVALS[label];
      const stAdd = this.INTERVALS[label] +1;

      if (stRemove !== undefined && stAdd !== undefined && stAdd <= 21) {
        suppress.add(stRemove);
        intervals.add(stAdd)
      } 
    };
    
    // Process each modifier to build up intervals
    for (const mod of modifiers) {
      switch (mod) {
        // Triad qualities
        case 'm':
          flatten('3');
          break;
        case 'dim':
          flatten('3'); flatten('5');
          break;
        case 'aug':
          sharpen('5');
          break;
        
        // Sevenths
        case '7':
          add('b7');
          break;
        case 'maj7':
          add('7');
          break;
        case 'ø7':
          flatten('3'); flatten('5'); add('b7');
          break;
        case 'dim7':
          flatten('3'); flatten('5'); add('6');
          break;
        case 'aug7':
          sharpen('5'); add('b7');
          break;

        // Extensions
        case 'maj9':
          add('7'); add('9');
          break;
        case 'add9':
          add('9');
          break;
        case 'add11':
          add('11');
          break;
        case 'add13':
          add('13');
          break;

        // Suspended
        case 'sus2':
          remove(['3', 'b3']); add('2');;
          break;
        case 'sus4':
          remove(['3', 'b3']); add('4');;
          break;

        // Altered 5ths
        case 'b5':
          flatten('5');
          break;
        case '#5':
          sharpen('5');
          break;
        case 'bb5':
          remove('5'); add('4');
          break;
        
        // Altered 9ths
        case 'b9':
          add('b9');
          break;
        case '#9':
          add('#9');
          break;
        // Altered 11th & 13th
        case '#11':
          add('#11');
          break;
        case 'b13':
          add('b13');
          break;
        // Suppressions
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

    const allNotes = [...intervals].filter(i => !suppress.has(i)).map(i => transpose(root, i));
    const notes = bass && !allNotes.includes(bass)
      ? [bass, ...allNotes.filter(n => n !== bass)]
      : allNotes;

    return { root, bass, modifiers, notes };
  }

  public parseChord(input: string): ChordAnalysis {
    const [mainPart, bassRaw] = input.split('/');
    const bass = bassRaw ? normalize(bassRaw) : undefined;

    const rootMatch = mainPart.match(/^([A-G][b#]?)/);
    if (!rootMatch) throw new Error('Invalid chord root');
    const root = normalize(rootMatch[1]);
    let rest = mainPart.slice(root.length);

    const modifiers: Modifier[] = [];
    const patterns: [RegExp, Modifier][] = [
      [/^ø7/, 'ø7'],
      [/^dim7|°7/, 'dim7'],
      [/^dim|°/, 'dim'],
      [/^aug7/, 'aug7'],
      [/^aug|\+/, 'aug'],
      [/^maj7/, 'maj7'],
      [/^maj9/, 'maj9'],
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
      // Try single letter modifiers last
      [/^m/, 'm'],
      [/^7/, '7'],
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
