import { Injectable } from "@angular/core";
import { TunedGrip } from "./grip-generator.service";

@Injectable({
  providedIn: 'root'
})
export class GripScorerService {
  scoreGrip(grip: TunedGrip): number {
    // Prefer frets 1-5
    const frets: number[] = [];
    grip.strings.forEach(f => {
      if (f !== 'o' && f !== 'x') {
        frets.push(Math.max(...f.map(x => x.fret)))
      }
    });
    const minFret = frets.length > 0 ? Math.min(...frets) : 1;
    const maxFret = frets.length > 0 ? Math.max(...frets) : 1;
    const fretSpan = maxFret - minFret;

    let fretPenalty = 0;
    if (minFret > 5) fretPenalty += 5;
    else if (minFret > 1) fretPenalty += (minFret - 1);

    // Prefer root inversion
    let inversionPenalty = 0;
    if (grip.inversion && grip.inversion !== 'root') inversionPenalty = 5;

    // Prefer grips without muted strings
    const mutedIndices = grip.strings.map((s, i) => s === 'x' ? i : -1).filter(i => i !== -1);
    const mutedStrings = mutedIndices.length;
    let mutedPenalty = mutedStrings * 2;

    // Prefer muted strings at the beginning (low E) over the end (high E)
    let mutedStart = 0, mutedEnd = 0;
    for (let i = 0; i < grip.strings.length; i++) {
      if (grip.strings[i] === 'x') mutedStart++;
      else break;
    }
    for (let i = grip.strings.length - 1; i >= 0; i--) {
      if (grip.strings[i] === 'x') mutedEnd++;
      else break;
    }
    // Prefer a single muted area
    let mutedAreaPenalty = 0;
    if (mutedStart > 0 && mutedEnd > 0 && mutedStart + mutedEnd < mutedStrings) {
      mutedAreaPenalty = 4; // muted at both ends
    } else if (mutedEnd > 0) {
      mutedAreaPenalty = 2; // muted at end
    } else if (mutedStart > 0) {
      mutedAreaPenalty = 1; // muted at start
    }

    // Prefer open strings
    const openStrings = grip.strings.filter(f => f === 'o').length;
    const openBonus = openStrings * 0.75;

    // Penalize barre chords (optional, can be tuned)
    const barrePenalty = frets.length !== new Set(frets).size ? 3 : 0;

    // Total score: lower is better
    return (
      fretSpan +
      fretPenalty +
      inversionPenalty +
      mutedPenalty +
      mutedAreaPenalty +
      barrePenalty -
      openBonus
    );
  }

  sortGrips(grips: TunedGrip[]): TunedGrip[] {
    return grips
      .map(grip => ({ grip, score: this.scoreGrip(grip) }))
      .sort((a, b) => a.score - b.score)
      .map(g => g.grip);
  }
}