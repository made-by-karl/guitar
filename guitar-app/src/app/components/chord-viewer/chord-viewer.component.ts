import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GripGeneratorService, TunedGrip } from 'app/services/grips/grip-generator.service';
import { ChordAnalysis, ChordAnalysisService } from 'app/services/chords/chord-analysis.service';
import { GripDiagramComponent } from 'app/components/grip-diagram/grip-diagram.component';
import { Chord, chordEquals, chordToString } from 'app/common/chords';
import { canAddModifier, Modifier, MODIFIERS } from 'app/common/modifiers';
import { Semitone, SEMITONES } from 'app/common/semitones';
import { GripScorerService } from 'app/services/grips/grip-scorer.service';
import { ChordProgressionService } from 'app/services/chords/chord-progression.service';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { combineLatest } from 'rxjs';
import { Degree, HarmonicFunctionsService } from 'app/services/chords/harmonic-functions.service';

@Component({
  selector: 'app-chord-viewer',
  standalone: true,
  imports: [CommonModule, FormsModule, GripDiagramComponent, RouterModule],
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
  progressions: Chord[][] = [];

  readonly BASE_MAJOR_PROGRESSION: Degree[] = ['I','V','vi','IV']
  readonly BASE_MINOR_PROGRESSION: Degree[] = ['i','VI','III','VII']

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

  currentChord: string | null = null;

  constructor(
    private gripGenerator: GripGeneratorService,
    private chordAnalyser: ChordAnalysisService,
    private gripScorer: GripScorerService,
    private chordProgression: ChordProgressionService,
    private harmonicFunctions: HarmonicFunctionsService,
    private router: Router,
    private route: ActivatedRoute,
  ) { }

  ngOnInit() {
    combineLatest([
      this.route.params,
      this.route.queryParamMap
    ]).subscribe(([params, queryParams]) => {
      this.currentChord = params['chord'];

      if (this.currentChord) {
        const analysis = this.tryParseChord(this.currentChord);
        if (analysis) {
          this.selectedRoot = analysis.root;
          this.selectedModifiers = analysis.modifiers;
          this.selectedBass = analysis.bass || null;
          this.chordAnalysis = analysis;

          const grips = this.gripGenerator.generateGrips(this.chordAnalysis, this.gripSettings);
          this.grips = this.gripScorer.sortGrips(grips);

          const progressions: Chord[][] = [];
          const inHarmonics = this.harmonicFunctions.find(analysis);

          for (const entry of inHarmonics) {
            const degrees = this.selectProgression(entry.tonic);
            if (degrees.includes(entry.degree)) {
              progressions.push(this.chordProgression.getProgression(entry.tonic, degrees));
            }
          }
          progressions.sort((a, b) => a.findIndex(x => chordEquals(x, analysis)) - b.findIndex(x => chordEquals(x, analysis)))
          this.progressions = progressions;
        }
      }
    });
  }

  private selectProgression(chord: Chord) {
    if (chord.modifiers.length === 0) return this.BASE_MAJOR_PROGRESSION;
    if (chord.modifiers.length === 1 && chord.modifiers[0] === 'm') return this.BASE_MINOR_PROGRESSION;
    return [];
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
    this.closeChordBuilder();
    const chord: Chord = { root: this.selectedRoot, modifiers: [...this.selectedModifiers] };
    const chordString = this.getChordQueryString(chord);
    // Navigate to the chord route with no query params
    this.router.navigate(['/chord', chordString], { queryParams: {} });
  }

  playChord(grip: TunedGrip) {
    // Implement logic to play the chord using a sound library or Web Audio API
    console.log('Playing chord:', grip);
  }

  closeChordBuilder() {
    const collapsibleElement = document.getElementById('chordBuilder');
    if (collapsibleElement) {
      collapsibleElement.classList.remove('show');

      const buttonElement = document.querySelector('[data-bs-target="#exampleCollapse"]');
      if (buttonElement) {
        const isExpanded = collapsibleElement.classList.contains('show');
        buttonElement.setAttribute('aria-expanded', (!isExpanded).toString());
      }
    }
  }

  getChordQueryString(chord: Chord): string {
    // Compose a string that can be parsed by chordAnalysisService
    return chordToString(chord);
  }

  chordEquals(a: Chord, b: Chord) {
    return chordEquals(a, b);
  }

  tryParseChord(input: string): ChordAnalysis | null {
    try {
      return this.chordAnalyser.parseChord(input);
    } catch {
      console.error('Failed to parse chord:', input);
      return null;
    }
  }
}
