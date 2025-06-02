import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FretboardService {
  readonly semitones = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  getGuitarFretboardConfig(): { tuning: FretBoardNote[], frets: number } {
    return {
      tuning: [
        note('E', 2),
        note('A', 2),
        note('D', 3),
        note('G', 3),
        note('B', 3),
        note('E', 4)],
      frets: 12
    };
  }

  getFretboard(tuning: FretBoardNote[], frets: number): FretBoardNote[][] {
    const fretboard: FretBoardNote[][] = Array.from({ length: frets + 1 }, () => []);

    tuning.forEach((note) => {
      const index = this.semitones.indexOf(note.semitone);
      Array.from({ length: frets + 1 }, (_, fret) => {
        const semitone = this.semitones[(index + fret) % 12];
        const octave = Math.floor((index + fret) / 12) + note.octave;
        fretboard[fret].push({ semitone, octave });
      });
    });

    return fretboard;
  }
}

export interface FretBoardNote {
  semitone: string;
  octave: number;
}

function note(semitone: string, octave: number): FretBoardNote {
  return { semitone, octave };
}
