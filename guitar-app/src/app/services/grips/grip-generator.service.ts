import { Injectable } from "@angular/core";
import { FretBoardNote, FretboardService } from "app/services/fretboard.service";
import type { ChordAnalysis } from 'app/services/chords/chord-analysis.service';

export type GuitarString = ('x' | 'o' | { fret: number; finger?: 1 | 2 | 3 | 4, isPartOfBarree: boolean; }[])
export interface Grip {
  strings: GuitarString[]; // 0 = low E, 5 = high E
}

export interface TunedGrip extends Grip {
  notes: (string | null)[];
  inversion: 'root' | '1st' | '2nd' | undefined;
}

@Injectable({
  providedIn: 'root'
})
export class GripGeneratorService {
  constructor(private fretboard: FretboardService) {}

  generateGrips(chord: ChordAnalysis, options: {
      allowMutedStringsInside?: boolean,
      minFretToConsider?: number,
      maxFretToConsider?: number,
      minimalPlayableStrings?: number,
      allowBarree?: boolean,
      allowInversions?: boolean,
      allowIncompleteChords?: boolean,
      allowDuplicateNotes?: boolean
    } = {}): TunedGrip[] {
    const allowMutedStringsInside = options.allowMutedStringsInside ?? false;
    const minFretToConsider = options.minFretToConsider ?? 1;
    const maxFretToConsider = options.maxFretToConsider ?? 12;
    const minimalPlayableStrings = options.minimalPlayableStrings ?? 3;
    const allowBarree = options.allowBarree ?? true;
    const allowInversions = options.allowInversions ?? true;
    const allowIncompleteChords = options.allowIncompleteChords ?? false;
    const allowDuplicateNotes = options.allowDuplicateNotes ?? false;

    if (minFretToConsider < 1 || maxFretToConsider < minFretToConsider) {
      throw new Error('Invalid fret range');
    }

    const guitarConfig = this.fretboard.getGuitarFretboardConfig();
    const fretboardMatrix = this.fretboard.getFretboard(guitarConfig.tuning, maxFretToConsider);
    const fingers = this.fingerConfiguration();

    const expectedNotes = [...chord.notes, ...((chord.bass) ? [chord.bass] : [])];

    const grips: TunedGrip[] = [];
    const tryAddGrip = (strings: GuitarString[], notes: (FretBoardNote | null)[]): boolean => {
      if (strings.filter(s => s !== 'x').length < minimalPlayableStrings) {
        return false; // Not enough strings
      }
      if (!allowBarree && strings.some(s => Array.isArray(s) && s.some(x => x.isPartOfBarree))) {
        return false; // Barree not allowed
      }
      if (!allowIncompleteChords && !expectedNotes.every(e => notes.map(n => n?.semitone).includes(e))) {
        return false; // Incomplete chord
      }
      if (!allowDuplicateNotes && new Set(notes.filter(n => n !== null).map(n => n.semitone + n.octave)).size !== notes.filter(n => n !== null).length) {
        return false; // Duplicate notes not allowed
      }

      const inversion = this.determineInversion(chord.notes, chord.root, notes);
      if (!allowInversions && inversion && inversion !== 'root') {
        return false; // Inversions not allowed
      }

      const grip: TunedGrip = {
        strings,
        notes: notes.map(n => n ? (n.semitone + n.octave) : null),
        inversion
      };

      // Check if the grip already exists, is a subset or superset of an existing grip
      const gripRootIndex = grip.strings.findIndex(s => s !== 'x');
      for (let i=0; i < grips.length; i++) {
        const otherGrip = grips[i];
        const otherRootIndex = otherGrip.strings.findIndex(s => s !== 'x');

        let diffState: 'gripIsSuperset' | 'gripIsSubset' | 'match' | 'conflict' | undefined = undefined;

        for (let i=0; i < grip.strings.length; i++) {
          const gripString = grip.strings[i];
          const otherString = otherGrip.strings[i];

          if ((gripString === 'o' && otherString === 'o') || (gripString === 'x' && otherString === 'x')) {
            diffState = diffState ?? 'match';
          } else if (Array.isArray(gripString) && Array.isArray(otherString)) {
            const gripFret = Math.max(...gripString.map(s => s.fret));
            const otherFret = Math.max(...otherString.map(s => s.fret));
            if (gripFret === otherFret) {
              diffState = diffState ?? 'match';
            } else {
              diffState = 'conflict';
              break; // Conflict, no need to check further
            }
          }
          else if (gripString === 'x') {
            if (!diffState || diffState === 'match' || diffState === 'gripIsSubset') {
              if (i < gripRootIndex) {
                // Accept only other grip, if the root note does not change
                const gripRoot = grip.notes[gripRootIndex]?.substring(0, 1);
                const otherRoot = otherGrip.notes[otherRootIndex]?.substring(0, 1);

                if (gripRoot !== otherRoot) {
                  diffState = 'conflict';
                  break; // Conflict, no need to check further
                }
              }

              diffState = 'gripIsSubset';
            } else {
              diffState = 'conflict';
              break; // Conflict, no need to check further
            }
          }
          else if (otherString === 'x') {
            if (i < otherRootIndex) {
                // Accept only new grip, if the other root note does not change
                const gripRoot = grip.notes[gripRootIndex]?.substring(0, 1);
                const otherRoot = otherGrip.notes[otherRootIndex]?.substring(0, 1);

                if (gripRoot !== otherRoot) {
                  diffState = 'conflict';
                  break; // Conflict, no need to check further
                }
              }
            if (!diffState || diffState === 'match' || diffState === 'gripIsSuperset') {
              diffState = 'gripIsSuperset';
            } else {
              diffState = 'conflict';
              break; // Conflict, no need to check further
            }
          } else {
            diffState = 'conflict';
            break; // Conflict, no need to check further
          }
        }

        if (diffState === 'match' || diffState === 'gripIsSubset') {
          // Grip already exists
          return false;
        }

        if (diffState === 'gripIsSuperset') {
          // Grip is a superset of an existing grip, replace the existing grip
          grips[i] = grip;
          return true; // Grip added
        }
      }

      // No existing grip found, add the new grip
      grips.push(grip);
      return true;
    }


    let fretWindowBase = minFretToConsider;
    while (fretWindowBase <= maxFretToConsider) {
      const fretConfiguration = this.fretConfiguration(fretWindowBase);
      const fretWindowEnd = Math.min(fretWindowBase + fretConfiguration.maxSpan, maxFretToConsider +1);

      // The notes of the current window that is evaluated
      const playableNotes: FretBoardNote[][] = [
        ...fretboardMatrix.slice(fretWindowBase, fretWindowEnd)
      ];

      const candidatePositions = this.getCandidatePositions(playableNotes, fretWindowBase, expectedNotes);
      if (candidatePositions.size === 0) {
        fretWindowBase++;
        continue; // No candidates for this fret, skip to next
      }

      // Calculate finger placements for the candidate positions
      type FingerPlacement = {
        fret: number;
        strings: number[];
      }
      const fingerPlacements: Map<number, FingerPlacement[]> = new Map();
      candidatePositions.forEach((strings, fret) => {
        const fingers: FingerPlacement[] = [];
        // Add a barree if there are at least 2 strings on the same fret
        if (strings.length > 1) {
          const barree: number[] = [];
          for (let i=5; i >= Math.min(...strings); i--) {
            barree.push(i);
          };
          
          fingers.push({ fret, strings: barree });
        }

        strings.forEach(string => {
          fingers.push({ fret, strings: [string] });
        })

        if (fingers.length > 0) {
          fingerPlacements.set(fret, fingers);
        }
      })

      // Combine possible finger placements
      const gripPlacements: FingerPlacement[][] = [];

      this.sorted(fingerPlacements).forEach(([fret, placements]) => {

        // Combine the placements on the same fret
        const bareePlacements = placements.filter(p => p.strings.length > 1);
        const singlePlacements = placements.filter(p => p.strings.length === 1);
        const fretPlacements = [...bareePlacements.map(p => [p]), ...this.combineElements(singlePlacements)];

        if (gripPlacements.length === 0) {
          gripPlacements.push(...fretPlacements);

          return; // First fret, just add the placements
        }
        
        const combinedPlacements = this.combineArrays(gripPlacements, fretPlacements, (a, p) => [...a, ...p])
                                          .filter(x => {
                                            // Skip combinations that are too long
                                            if (x.length > fingers.length) return false;

                                            const singles = x.filter(p => p.strings.length === 1);
                                            
                                            // Remove combinations that have duplicate single-strings
                                            const strings = singles.map(p => p.strings[0]);
                                            if (new Set(strings).size !== strings.length) return false;

                                            // Remove combinations that have a barree hiding a single-string placement
                                            const barrees = x.filter(p => p.strings.length > 1);
                                            for (const barree of barrees) {
                                              for (const single of singles) {
                                                if (barree.fret > single.fret && barree.strings.includes(single.strings[0])) {
                                                  return false; // Barree hides single-string placement
                                                }
                                              }
                                            }

                                            return true; // Valid combination
                                          });

        gripPlacements.push(...combinedPlacements);
      })

      gripPlacements.map((placements) => {
        const strings: GuitarString[] = Array(6).fill('o');
        placements.forEach((placement) => {
          const isBarree = placement.strings.length > 1;
          placement.strings.forEach((stringIndex) => {
            if (strings[stringIndex] === 'o') {
              strings[stringIndex] = [];
            }
            
            if (Array.isArray(strings[stringIndex])) {
              strings[stringIndex].push({ fret: placement.fret, isPartOfBarree: isBarree });
            }
          })
        })

        // Modify grip, so that only the expected notes are played
        const notes = this.getNotesForGrip(strings, fretboardMatrix);
        notes.forEach((note, index) => {
          if (note === null || !expectedNotes.includes(note.semitone)) {
            strings[index] = 'x'; // Muted string
            notes[index] = null;
          }
        })

        // Handle muted strings inside playable strings
        if (!allowMutedStringsInside) {
          strings.forEach((string, index) => {
            if (string === 'x') {
              const stringsBefore = strings.slice(0, index).map((s: GuitarString): number => s !== 'x' ? 1 : 0).reduce((a, b) => a + b, 0);
              const stringsAfter = strings.slice(index + 1).map((s: GuitarString): number => s !== 'x' ? 1 : 0).reduce((a, b) => a + b, 0);
              
              let muteBefore = false;
              let muteAfter = false;

              if (stringsBefore < stringsAfter) {
                muteBefore = true; // Mute all strings before this one
              } else if (stringsBefore > stringsAfter) {
                muteAfter = true; // Mute all strings after this one
              } else {
                // If equal, prefer strings before
                muteAfter = true;
              }

              if (muteBefore) {
                for (let i = 0; i < index; i++) {
                  if (strings[i] !== 'x') {
                    strings[i] = 'x';
                    notes[i] = null;
                  }
                }
              }

              if (muteAfter) {
                for (let i = index + 1; i < strings.length; i++) {
                  if (strings[i] !== 'x') {
                    strings[i] = 'x';
                    notes[i] = null;
                  }
                }
              }
            }
          })
        }

        if (chord.bass !== undefined) {
          const bassIndex = notes.findIndex(n => n !== null && n.semitone === chord.bass);
          if (bassIndex !== -1) {
            if (bassIndex > 0) {
              // If bass note is played, mute all strings before it
              for (let i = 0; i < bassIndex; i++) {
                if (strings[i] !== 'x') {
                  strings[i] = 'x';
                  notes[i] = null;
                }
              }
            }
          } else {
            return; // No bass note played, skip this grip
          }
        } else {
          const rootIndex = notes.findIndex(n => n !== null && n.semitone === chord.root);
          if (rootIndex > 0) {
            const clonedStrings = [...strings];
            const clonedNotes = [...notes];
            // If root note is played, mute all strings before it
            for (let i = 0; i < rootIndex; i++) {
              if (clonedStrings[i] !== 'x') {
                clonedStrings[i] = 'x';
                clonedNotes[i] = null;
              }
            }

            tryAddGrip(clonedStrings, clonedNotes);
          }
        }

        tryAddGrip(strings, notes);
      });
      

      fretWindowBase++;
    }

    return grips;
  }

  private getNotesForGrip(strings: GuitarString[], fretboardMatrix: FretBoardNote[][]): (FretBoardNote | null)[] {
    const notes: (FretBoardNote | null)[] = [];
    strings.forEach((string, stringIndex) => {
      if (string === 'x') {
        notes.push(null); // Muted string
      } else if (string === 'o') {
        const note = fretboardMatrix[0][stringIndex];
        notes.push(note); // Open string
      } else if (Array.isArray(string)) {
        const maxFret = Math.max(...string.map(s => s.fret));
        const note = fretboardMatrix[maxFret][stringIndex];
        notes.push(note); // Open string
      }
    });
    return notes;
  }

  private getCandidatePositions(fretboardNotes: FretBoardNote[][], currentFret: number, notes: string[]): Map<number, number[]> {
      const candidatePositions: Map<number, number[]> = new Map();
      fretboardNotes.forEach((fretNotes, windowIndex) => {
        const fretIndex = currentFret + windowIndex;

        fretNotes.forEach((note, stringIndex) => {
          if (!notes.includes(note.semitone)) return; // Only consider expected notes

          if (!candidatePositions.has(fretIndex)) {
            candidatePositions.set(fretIndex, []);
          }
          candidatePositions.get(fretIndex)?.push(stringIndex);
        })

        if (!candidatePositions.has(currentFret)) {
            return; // Skip if no candidates for the current fret
        }
      })

      return candidatePositions;     
    }

  private combineElements<T>(array: T[]): T[][] {
    const result: T[][] = [];

    const generate = (current: T[], remaining: T[]) => {
      if (current.length > 0) {
        result.push(current);
      }

      for (let i = 0; i < remaining.length; i++) {
        generate([...current, remaining[i]], remaining.slice(i + 1));
      }
    };

    generate([], array);
    return result;
  }

  private combineArrays<T, U, V>(array1: T[], array2: U[], combineFn: (v1: T, v2: U) => V): V[] {
    const result: V[] = [];

    array1.forEach(comb1 => {
      array2.forEach(comb2 => {
        result.push(combineFn(comb1, comb2));
      });
    });

    return result;
  }

  private sorted<K, V>(map : Map<K, V>, compareFn?: ((a: K, b: K) => number)): [K, V][] {
    return Array.from(map.keys()).sort(compareFn).map((key) => [key, map.get(key)] as [K, V]);
  }
  
  private fingerConfiguration(): Finger[] {
    return [
      { finger: 'index', strings: [0, 1, 2, 3, 4, 5], barreeRange: 5 },
      { finger: 'middle', strings: [0, 1, 2, 3, 4, 5], barreeRange: 5 },
      { finger: 'ring', strings: [0, 1, 2, 3, 4, 5], barreeRange: 5 },
      { finger: 'pinky', strings: [0, 1, 2, 3, 4, 5], barreeRange: 3 }
      // { finger: 'thumb', strings: [5], barree: [] }
    ];
  }

  private fretConfiguration(fret: number): { maxSpan: number; maxFingers: number } {
    return { maxSpan: 3, maxFingers: 3 }
  }

  private determineInversion(chordNotes: string[], root: string, notes: (FretBoardNote | null)[]): 'root' | '1st' | '2nd' | undefined {
      const playedNotes = notes.filter(n => n !== null).map(n => n.semitone);
      if (playedNotes.length === 0) return undefined

      const bassNote = playedNotes[0];

      if (bassNote === root) return 'root';

      const index = chordNotes.indexOf(bassNote);
      if (index === 1) return '1st';
      if (index === 2) return '2nd';
      
      return undefined;
    }
}

type Finger = {
  finger: 'thumb' |'index' | 'middle' | 'ring' | 'pinky';
  strings: number[];
  barreeRange: number;
}

export function stringifyGrip(grip: Grip): string {
  return grip.strings.map(s => {
    if (s === 'x') return 'x';
    if (s === 'o') return 'o';
    const maxFret = Math.max(...s.map(n => n.fret));
    const string = s.filter(n => n.fret === maxFret)[0];
    return string.fret + (string.isPartOfBarree ? 'b' : '');
  }).join('|');
}
export function parseGrip(gripString: string): Grip {
  const strings = gripString.split('|').map(s => {
    if (s === 'x') return 'x';
    if (s === 'o') return 'o';
    const isBarree = s.endsWith('b');
    const f = isBarree ? s.slice(0, -1) : s; // Remove 'b' if it's a barree

    return [{ fret: parseInt(f), isPartOfBarree: isBarree }];
  });

  return { strings };
}
