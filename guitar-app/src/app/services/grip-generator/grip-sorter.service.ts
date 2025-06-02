import { Injectable } from "@angular/core";
import { GuitarGrip } from "./grip-generator.service";
import { GripScorerService } from "./grip-scorer.service";

@Injectable({
  providedIn: 'root'
})
export class GripSorterService {
  constructor(private scorer: GripScorerService) {}

  sortGrips(grips: GuitarGrip[]): GuitarGrip[] {
    return grips
      .map(grip => ({ grip, score: this.scorer.scoreGrip(grip) }))
      .sort((a, b) => a.score - b.score)
      .map(g => g.grip);
  }
}