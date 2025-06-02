import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FretboardService {
  private semitones = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  getGuitarFretboard(): string[][] {
    const tuning = ['E', 'A', 'D', 'G', 'B', 'E']; // Standard tuning
    return this.getFretboard(tuning, 12);
  }

  getFretboard(tuning: string[], frets: number): string[][] {
    return tuning.map(note => {
      const index = this.semitones.indexOf(note);
      return Array.from({ length: frets + 1 }, (_, fret) =>
        this.semitones[(index + fret) % 12]
      );
    });
  }

  getPositions(fretboard: string[][], note: string): FretPosition[] {
    const positions: FretPosition[] = [];
    fretboard.forEach((stringNotes, stringIndex) => {
      stringNotes.forEach((fretNote, fretIndex) => {
        if (fretNote === note) {
          positions.push({
            string: 6 - stringIndex, // Convert to 6 (low E) to 1 (high E)
            fret: fretIndex,
            note: fretNote
          });
        }
      });
    });
    return positions;
  }
}

// 2. FretboardService – maps notes to fretboard positions
export interface FretPosition {
  string: number; // 1 (high E) to 6 (low E)
  fret: number;
  note: string;
}
