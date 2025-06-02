import { Injectable } from "@angular/core";
import { GuitarGrip } from "./grip-generator.service";

// 4. GripScorerService – rates grips based on ergonomic factors
@Injectable({
  providedIn: 'root'
})
export class GripScorerService {
  scoreGrip(grip: GuitarGrip): number {
    const frets = grip.frets.filter(f => typeof f === 'number') as number[];
    const openStrings = grip.frets.filter(f => f === 0).length;
    const mutedStrings = grip.frets.filter(f => f === 'x').length;
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