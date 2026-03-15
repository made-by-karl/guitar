import { Injectable } from "@angular/core";
import { FretboardService } from '@/app/features/grips/services/fretboard.service';
import { Grip, TunedGrip } from '@/app/features/grips/services/grips/grip.model';
import { Note } from "@/app/core/music/semitones";

@Injectable({
  providedIn: 'root'
})
export class GripService {
  constructor(private fretboard: FretboardService) {}

  public toTunedGrip(grip: Grip, tuning: Note[]): TunedGrip {
    const notes = grip.strings.map((s, i) => {
      if (s === 'x') return null; // Muted string
      if (s === 'o') return tuning[i]; // Open string
      if (Array.isArray(s)) {
        // Fret array, find the highest fret
        const fret = Math.max(...s.map(f => f.fret));
        return this.fretboard.getNoteAtFret(tuning[i], fret);
      }
      return null; // Should not happen
    }).map(note => note ? `${note.semitone}${note.octave}` : null);

    return { ...grip, notes, inversion: undefined };
  }
}