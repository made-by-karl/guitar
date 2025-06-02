import { Injectable } from "@angular/core";
import { Grip } from "./grip-generator.service";

// 4. GripScorerService – rates grips based on ergonomic factors
@Injectable({
  providedIn: 'root'
})
export class GripScorerService {
  scoreGrip(grip: Grip): number {
    const frets: number[] = [];
    grip.strings.forEach(f => { if (f !== 'o' && f !== 'x') { frets.push(Math.max(...f.map(x => x.fret))) }});
    const openStrings = grip.strings.filter(f => f === 'o').length;
    const mutedStrings = grip.strings.filter(f => f === 'x').length;
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