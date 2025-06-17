import { Injectable } from '@angular/core';
import { Semitone, SEMITONES } from './constants';

@Injectable({ providedIn: 'root' })
export class FretboardService {
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
      const index = SEMITONES.indexOf(note.semitone);
      Array.from({ length: frets + 1 }, (_, fret) => {
        const semitone = SEMITONES[(index + fret) % 12];
        const octave = Math.floor((index + fret) / 12) + note.octave;
        fretboard[fret].push({ semitone, octave });
      });
    });

    return fretboard;
  }
}

export interface FretBoardNote {
  semitone: Semitone;
  octave: number;
}

function note(semitone: Semitone, octave: number): FretBoardNote {
  return { semitone, octave };
}
