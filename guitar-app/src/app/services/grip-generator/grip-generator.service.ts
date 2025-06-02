import { Injectable } from "@angular/core";
import { FretboardService, FretPosition } from "../fretboard.service";

// 3. GripGeneratorService – generates grips with ergonomic constraints
export interface GuitarGrip {
  frets: (number | 'x')[]; // From string 6 to 1
  notes: (string | null)[];
}

@Injectable({
  providedIn: 'root'
})
export class GripGeneratorService {

  constructor(private fretboard: FretboardService) {}

  generateGrips(chordNotes: string[], root: string | undefined = undefined, bass: string | undefined = undefined): GuitarGrip[] {
    if (root === undefined) {
      root = chordNotes[0]; // Default to first note if no root specified
    }
    if (bass === undefined) {
      bass = root; // Default bass to root if not specified
    }

    const fretboardMatrix = this.fretboard.getGuitarFretboard();

    const stringMap: Map<number, FretPosition[]> = new Map();
    for (let string = 1; string <= 6; string++) {
      const notePositions: FretPosition[] = [];
      for (const note of chordNotes) {
        notePositions.push(
          ...this.fretboard
            .getPositions(fretboardMatrix, note)
            .filter(p => p.string === string)
            .sort((a, b) => a.fret - b.fret) // Prioritize open frets
        );
      }
      stringMap.set(string, notePositions);
    }

    const grips: GuitarGrip[] = [];

    const isValidMutedLayout = (frets: (number | 'x')[]): boolean => {
      let foundPlayed = false;
      let mutedInside = false;
      for (let i = 0; i < frets.length; i++) {
        if (frets[i] !== 'x') {
          if (mutedInside) return false;
          foundPlayed = true;
        } else if (foundPlayed) {
          mutedInside = true;
        }
      }
      return true;
    };

    const recurse = (
      currentString: number,
      frets: (number | 'x')[],
      notes: (string | null)[],
      usedNotes: Set<string>,
      minFret: number,
      maxFret: number
    ) => {
      if (currentString === 0) {
        if (chordNotes.every(n => usedNotes.has(n))) {
          const lowestIndex = frets.findIndex(f => typeof f === 'number');
          if (lowestIndex >= 0) {
            const lowestNote = notes[lowestIndex];
            if (lowestNote === bass && isValidMutedLayout(frets)) {
              grips.push({ frets: [...frets], notes: [...notes] });
            }
          }
        }
        return;
      }

      // Option 1: mute string
      frets[currentString - 1] = 'x';
      notes[currentString - 1] = null;
      recurse(currentString - 1, frets, notes, new Set(usedNotes), minFret, maxFret);

      // Option 2: use valid fret positions for this string
      const positions = stringMap.get(currentString) ?? [];
      for (const pos of positions) {
        if (pos.fret > 8) continue;
        const newMin = Math.min(minFret, pos.fret);
        const newMax = Math.max(maxFret, pos.fret);
        if (newMax - newMin > 4) continue;

        frets[currentString - 1] = pos.fret;
        notes[currentString - 1] = pos.note;
        const newUsed = new Set(usedNotes);
        newUsed.add(pos.note);
        recurse(currentString - 1, frets, notes, newUsed, newMin, newMax);
      }
    };

    recurse(6, Array(6).fill('x'), Array(6).fill(null), new Set(), 99, 0);
    return grips;
  }

  private scoreGrip(grip: (number | 'x')[]): number {
    const frets = grip.filter(f => f !== 'x') as number[];
    const openStrings = frets.filter(f => f === 0).length;
    const mutedStrings = grip.filter(f => f === 'x').length;
    const fretSpan = frets.length > 0 ? Math.max(...frets) - Math.min(...frets) : 0;
    const barrePenalty = frets.length !== new Set(frets).size ? 3 : 0;

    return (
      fretSpan +
      barrePenalty +
      (frets.length > 0 ? Math.min(...frets) > 5 ? 5 : 0 : 0) -
      openStrings * 2 +
      mutedStrings
    );
  }
}