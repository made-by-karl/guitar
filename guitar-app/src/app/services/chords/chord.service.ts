import { Injectable } from "@angular/core";
import { Semitone } from 'app/common/semitones';
import { Modifier, areModifiersValid, MODIFIER_DEFINITIONS } from 'app/common/modifiers';
import { normalize, transpose } from 'app/common/semitones';
import { Chord } from "app/common/chords";

export type ExtendedChord = Chord & {
  bass?: Semitone;
  notes: Semitone[];
};

/**
 * Chord Analysis Service
 * This service provides functionality to parse and analyze guitar chords.
 * It can identify the root note, bass note, modifiers, and the notes that make up the chord.
 * 
 * Supported
 * Basic triads: maj, m, dim, aug
 * Power chords: 5
 * Major 6th
 * Sevenths: 7, maj7, dim7, aug7
 * Suspensions: sus2, sus4
 * Extensions: add9, add11, add13
 * Alterations: b5, #5, b9, #9, #11, b13
 * Slash chords (bass note)
 */
@Injectable({
  providedIn: 'root'
})
export class ChordService {

  // Maps the "chord formula" to SEMITONES, i.e. C = C-E-G: root-3-5 => [0, 4, 7]
  readonly INTERVALS: Record<string, number> = {
    '1': 0, 'b2': 1, '2': 2, '#2': 3,
    'b3': 3, '3': 4, '4': 5, '#4': 6, 'b5': 6,
    '5': 7, '#5': 8, '6': 9, 'b7': 10, '7': 11,
    'b9': 13, '9': 14, '#9': 15, '11': 17, '#11': 18,
    'b13': 20, '13': 21,
  };

  public calculateNotes(root: Semitone, modifiers: Modifier[], bass?: Semitone): ExtendedChord {
    const modifiersValid = areModifiersValid(modifiers);
    if (modifiersValid !== true) {
      throw new Error(`Invalid modifier combination: ${modifiersValid}`);
    }

    // Start with the basic triad intervals
    const intervals: Set<number> = new Set([this.INTERVALS['1'], this.INTERVALS['3'], this.INTERVALS['5']]);
    const suppress: Set<number> = new Set();

    // Apply each modifier using the common definition system
    for (const modifier of modifiers) {
      this.applyModifierOperations(intervals, suppress, modifier);
    }

    const uniqueNotes = new Set<string>();
    const allNotes = [...intervals].filter(i => !suppress.has(i))
                      .map(i => transpose(root, i))
                      .filter(n => {
                        if (!uniqueNotes.has(n)) {
                          uniqueNotes.add(n);
                          return true;
                        }
                        return false;
                      });
    const notes = bass && !allNotes.includes(bass)
      ? [bass, ...allNotes.filter(n => n !== bass)]
      : allNotes;

    return { root, bass, modifiers, notes };
  }

  public parseChord(input: string): ExtendedChord {
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
      [/^5/, '5'],
      [/^6/, '6'],
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

  private applyModifierOperations(
    intervals: Set<number>,
    suppress: Set<number>,
    modifier: Modifier
  ): void {
    const definition = MODIFIER_DEFINITIONS[modifier];
    if (!definition) return;

    for (const operation of definition.operations) {
      switch (operation.type) {
        case 'add':
          const addInterval = this.INTERVALS[operation.interval];
          if (addInterval !== undefined) {
            intervals.add(addInterval);
          }
          break;

        case 'remove':
          for (const intervalName of operation.intervals) {
            const removeInterval = this.INTERVALS[intervalName];
            if (removeInterval !== undefined) {
              suppress.add(removeInterval);
            }
          }
          break;

        case 'replace':
          // Remove the old intervals
          for (const intervalName of operation.from) {
            const removeInterval = this.INTERVALS[intervalName];
            if (removeInterval !== undefined) {
              suppress.add(removeInterval);
            }
          }
          // Add the new interval
          const newInterval = this.INTERVALS[operation.to];
          if (newInterval !== undefined) {
            intervals.add(newInterval);
          }
          break;
      }
    }
  }
}
