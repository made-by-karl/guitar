import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GripGeneratorService, TunedGrip } from '../../services/grips/grip-generator.service';
import { ChordAnalysis, ChordAnalysisService } from '../../services/chords/chord-analysis.service';
import { GripDiagramComponent } from '../grip-diagram/grip-diagram.component';
import { MODIFIERS, Modifier, canAddModifier } from '../../services/modifiers';
import { SEMITONES, Semitone } from '../../services/semitones';
import { GripScorerService } from '../../services/grips/grip-scorer.service';

@Component({
  selector: 'app-chord-viewer',
  standalone: true,
  imports: [CommonModule, FormsModule, GripDiagramComponent],
  templateUrl: './chord-viewer.component.html',
  styleUrls: ['./chord-viewer.component.scss']
})
export class ChordViewerComponent implements OnInit {
  grips: TunedGrip[] = [];
  modifiers: Modifier[] = [...MODIFIERS];
  bassNotes: Semitone[] = [...SEMITONES];
  roots: Semitone[] = [...SEMITONES];
  selectedRoot: Semitone = 'C';
  selectedModifiers: Modifier[] = [];
  selectedBass: Semitone | null = null;

  chordAnalysis: ChordAnalysis | null = null

  gripSettings = {
    allowMutedStringsInside: false,
    minFretToConsider: 1,
    maxFretToConsider: 12,
    minimalPlayableStrings: 3,
    allowBarree: true,
    allowInversions: true,
    allowIncompleteChords: false,
    allowDuplicateNotes: false
  };

  constructor(
    private gripGenerator: GripGeneratorService,
    private chordAnalyser: ChordAnalysisService,
    private gripScorer: GripScorerService
  ) {}

  ngOnInit() {
  }


  toggleModifier(modifier: Modifier) {
    if (this.selectedModifiers.includes(modifier)) {
      this.selectedModifiers = this.selectedModifiers.filter(m => m !== modifier);
    } else {
      this.selectedModifiers.push(modifier);
    }
  }

  isModifierDisabled(modifier: Modifier): boolean {
    return canAddModifier(this.selectedModifiers, modifier) !== true;
  }

  generateGrips() {
    this.toggleChordBuilder();
    this.chordAnalysis = this.chordAnalyser.calculateNotes(this.selectedRoot, this.selectedModifiers, this.selectedBass || undefined);
    const grips = this.gripGenerator.generateGrips(this.chordAnalysis, this.gripSettings);
    this.grips = this.gripScorer.sortGrips(grips);
  }

  playChord(grip: TunedGrip) {
    // Implement logic to play the chord using a sound library or Web Audio API
    console.log('Playing chord:', grip);
  }

  toggleChordBuilder() {
    const collapsibleElement = document.getElementById('chordBuilder');
    if (collapsibleElement) {
      collapsibleElement.classList.toggle('show');

      const buttonElement = document.querySelector('[data-bs-target="#exampleCollapse"]');
      if (buttonElement) {
        const isExpanded = collapsibleElement.classList.contains('show');
        buttonElement.setAttribute('aria-expanded', (!isExpanded).toString());
      }
    }
  }
}
