import { Injectable } from "@angular/core";
import { SEMITONES, Modifier, Semitone } from "./constants";

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
  readonly FLAT_EQUIVS: Record<string, Semitone> = {
    'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B',
  };
  private readonly NOTE_MAP = Object.fromEntries(SEMITONES.map((n, i) => [n, i]));

  private normalize(note: string): Semitone {
    return this.FLAT_EQUIVS[note] || note;
  }

  private transpose(root: string, semitones: number): Semitone {
    const idx = this.NOTE_MAP[this.normalize(root)];
    return SEMITONES[(idx + semitones + 12) % 12];
  }

  // Maps the "chord formula" to SEMITONES, i.e. C = C-E-G: root-3-5 => [0, 4, 7]
  readonly INTERVALS: Record<string, number> = {
    '1': 0, 'b2': 1, '2': 2, '#2': 3,
    'b3': 3, '3': 4, '4': 5, '#4': 6, 'b5': 6,
    '5': 7, '#5': 8, '6': 9, 'b7': 10, '7': 11,
    'b9': 13, '9': 14, '#9': 15, '11': 17, '#11': 18,
    'b13': 20, '13': 21,
  };

  public calculateNotes(root: Semitone, modifiers: Modifier[], bass?: Semitone): ChordAnalysis {
    const areModifiersValid = this.areModifiersValid(modifiers);
    if (areModifiersValid !== true) {
      throw new Error(`Invalid modifier combination: ${areModifiersValid}`);
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

  public areModifiersValid(modifiers: Modifier[]): true | string[] {
    const conflicts: string[] = [];
    const seen: Set<Modifier> = new Set();

    for (const mod of modifiers) {
      if (seen.has(mod)) continue; // Skip duplicates
      seen.add(mod);

      const result = this.canAddModifier(Array.from(seen), mod);
      if (result !== true) {
        conflicts.push(result);
      }
    }

    return conflicts.length > 0 ? conflicts : true;
  }

  public canAddModifier(existingModifiers: Modifier[], newModifier: Modifier): true | string {
    const conflicts: [Modifier, Modifier, string][] = [
      // Third clashes
      ['m', 'sus2', '“m” needs ♭3, “sus2” replaces 3 with 2'],
      ['m', 'sus4', '“m” needs ♭3, “sus4” replaces 3 with 4'],
      ['m', 'no3', '“m” needs ♭3, but “no3” removes the 3rd'],
      ['sus2', 'sus4', 'You cannot replace the 3rd with both 2 and 4'],

      // Seventh clashes
      ['7', 'maj7', '“7” uses ♭7, but “maj7” uses ♮7'],
      ['7', 'maj9', '“7” uses ♭7, but “maj9” implies ♮7'],
      ['7', 'dim7', '“7” uses ♭7, “dim7” uses ♭♭7'],
      ['7', 'ø7', '“7” is dominant, “ø7” is half-diminished'],
      ['7', 'aug7', '“7” uses perfect 5th, “aug7” uses ♯5'],

      ['maj7', 'dim7', '“maj7” uses ♮7, “dim7” uses ♭♭7'],
      ['maj7', 'ø7', '“maj7” uses ♮7, “ø7” uses ♭7'],
      ['maj7', 'aug7', '“maj7” uses ♮7, “aug7” uses ♭7'],
      ['maj9', 'dim7', '“maj9” uses ♮7, “dim7” uses ♭♭7'],
      ['maj9', 'ø7', '“maj9” uses ♮7, “ø7” uses ♭7'],
      ['maj9', 'aug7', '“maj9” uses ♮7, “aug7” uses ♭7'],

      ['ø7', 'dim7', '“ø7” uses ♭7, “dim7” uses ♭♭7'],
      ['ø7', 'aug7', '“ø7” uses ♭7, “aug7” uses ♯5'],
      ['dim7', 'aug7', '“dim7” uses ♭♭7 and ♭5, “aug7” uses ♭7 and ♯5'],

      ['7', 'no7', '“7” requires a 7th, but “no7” removes it'],
      ['maj7', 'no7', '“maj7” requires a 7th, but “no7” removes it'],
      ['maj9', 'no7', '“maj9” implies maj7, which conflicts with “no7”'],
      ['ø7', 'no7', '“ø7” includes a 7th, “no7” removes it'],
      ['dim7', 'no7', '“dim7” includes a 7th, “no7” removes it'],
      ['aug7', 'no7', '“aug7” includes a 7th, “no7” removes it'],

      // Fifth clashes
      ['b5', '#5', 'Cannot have both ♭5 and ♯5'],
      ['b5', 'bb5', 'Cannot have both ♭5 and ♭♭5'],
      ['#5', 'bb5', 'Cannot have both ♯5 and ♭♭5'],
      ['dim', 'aug', '“dim” has ♭5, “aug” has ♯5'],
      ['dim', '#5', '“dim” has ♭5, “#5” contradicts it'],
      ['dim', 'aug7', '“dim” has ♭5, “aug7” has ♯5'],
      ['aug', 'b5', '“aug” has ♯5, “b5” contradicts it'],
      ['aug', 'bb5', '“aug” has ♯5, “bb5” contradicts it'],
      ['aug', 'dim7', '“aug” has ♯5, “dim7” has ♭5'],
      ['aug', 'ø7', '“aug” has ♯5, “ø7” has ♭5'],
      ['dim', 'no5', '“dim” uses ♭5, “no5” removes the 5th'],
      ['aug', 'no5', '“aug” uses ♯5, “no5” removes the 5th'],
      ['b5', 'no5', '“b5” defines the 5th, “no5” removes it'],
      ['#5', 'no5', '“#5” defines the 5th, “no5” removes it'],
      ['bb5', 'no5', '“bb5” defines the 5th, “no5” removes it'],
      ['dim7', 'no5', '“dim7” defines the 5th, “no5” removes it'],
      ['ø7', 'no5', '“ø7” defines the 5th, “no5” removes it'],
      ['aug7', 'no5', '“aug7” defines the 5th, “no5” removes it'],

      // Ninth
      ['add9', 'b9', '“add9” adds natural 9, “b9” alters it'],
      ['add9', '#9', '“add9” adds natural 9, “#9” alters it'],
      ['maj9', 'b9', '“maj9” uses natural 9, “b9” contradicts it'],
      ['maj9', '#9', '“maj9” uses natural 9, “#9” contradicts it'],
      ['b9', '#9', 'Cannot have both ♭9 and ♯9'],

      // Eleventh
      ['add11', '#11', 'Cannot have both natural 11 and ♯11'],

      // Thirteenth
      ['add13', 'b13', 'Cannot have both natural 13 and ♭13'],
    ];

    for (const [a, b, reason] of conflicts) {
      if (
        (existingModifiers.includes(a) && newModifier === b) ||
        (existingModifiers.includes(b) && newModifier === a)
      ) {
        return reason;
      }
    }

    return true;
  }

  public getModifierDescription(modifier: Modifier): string {
    const descriptions: Record<Modifier, string> = {
      // Triad qualities
      'm': 'Minor triad (♭3)',
      'dim': 'Diminished triad (♭3, ♭5)',
      'aug': 'Augmented triad (♯5)',

      // Sevenths
      '7': 'Dominant 7th (♭7)',
      'maj7': 'Major 7th (♮7)',
      'ø7': 'Half-diminished 7th (♭3, ♭5, ♭7)',
      'dim7': 'Diminished 7th (♭3, ♭5, ♭♭7)',
      'aug7': 'Augmented 7th (♯5, ♭7)',

      // Extensions
      'maj9': 'Major 9th (maj7 + 9)',
      'add9': 'Add major 9th (2nd)',
      'add11': 'Add perfect 11th (4th)',
      'add13': 'Add 13th (6th)',

      // Suspended
      'sus2': 'Suspend 2nd (replace 3rd with 2nd)',
      'sus4': 'Suspend 4th (replace 3rd with 4th)',

      // Altered 5ths
      'b5': 'Flattened 5th (♭5)',
      '#5': 'Sharpened 5th (♯5)',
      'bb5': 'Double-flattened 5th (♭♭5)',

      // Altered 9ths
      'b9': 'Flattened 9th (♭9)',
      '#9': 'Sharpened 9th (♯9)',

      // Altered 11th & 13th
      '#11': 'Sharpened 11th (♯11)',
      'b13': 'Flattened 13th (♭13)',

      // Suppressions
      'no3': 'Omit 3rd',
      'no5': 'Omit 5th',
      'no7': 'Omit 7th',
    };

    return descriptions[modifier] ?? 'Unknown modifier';
  }
}
