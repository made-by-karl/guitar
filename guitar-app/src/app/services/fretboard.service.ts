import { Injectable } from '@angular/core';
import { Semitone, SEMITONES, Note, note } from 'app/common/semitones';

@Injectable({ providedIn: 'root' })
export class FretboardService {
  getGuitarFretboardConfig(): { tuning: Note[], frets: number } {
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

  getFretboard(tuning: Note[], frets: number): Note[][] {
    const fretboard: Note[][] = Array.from({ length: frets + 1 }, () => []);

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

  /**
   * Get a specific note for a given string and fret position
   * @param tuning Array of tuning notes for each string
   * @param stringIndex Index of the string (0-5, where 0 is lowest string)
   * @param fret Fret position (0 for open string)
   * @returns The Note at the specified position
   */
  getNoteAtPosition(tuning: Note[], stringIndex: number, fret: number): Note {
    if (stringIndex < 0 || stringIndex >= tuning.length) {
      throw new Error(`Invalid string index: ${stringIndex}. Must be between 0 and ${tuning.length - 1}`);
    }
    
    if (fret < 0) {
      throw new Error(`Invalid fret: ${fret}. Must be 0 or greater`);
    }

    const openStringNote = tuning[stringIndex];
    const baseSemitoneIndex = SEMITONES.indexOf(openStringNote.semitone);
    
    const semitoneIndex = (baseSemitoneIndex + fret) % 12;
    const semitone = SEMITONES[semitoneIndex];
    const octave = Math.floor((baseSemitoneIndex + fret) / 12) + openStringNote.octave;
    
    return { semitone, octave };
  }
}
