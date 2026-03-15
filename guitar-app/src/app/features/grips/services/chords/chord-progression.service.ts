import { Injectable } from '@angular/core';
import { Chord } from '@/app/core/music/chords';
import { Degree, HarmonicFunctionsService } from '@/app/features/grips/services/chords/harmonic-functions.service';

@Injectable({ providedIn: 'root' })
export class ChordProgressionService {

  constructor(private harmonicFunctions : HarmonicFunctionsService) {
  }

  getProgression(key: Chord, progression: Array<Degree>): Chord[] {
    const result: Chord[] = [];
    const chords = this.harmonicFunctions.getChordsInKeyOf(key);
    for (const degree of progression) {
      const chord = chords.get(degree);
      if (chord) {
        result.push(chord);
      }
    }

    return result;
  }
}
