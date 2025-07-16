import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GripGeneratorService } from 'app/services/grips/grip-generator.service';
import { Grip, stringifyGrip, TunedGrip } from 'app/services/grips/grip.model';
import { ExtendedChord, ChordService } from 'app/services/chords/chord.service';
import { GripDiagramComponent } from 'app/components/grip-diagram/grip-diagram.component';
import { Chord, chordEquals, chordToString } from 'app/common/chords';
import { canAddModifier, isModifierSubset, Modifier, MODIFIERS, MODIFIER_DEFINITIONS, getModifierDescription } from 'app/common/modifiers';
import { Semitone, SEMITONES } from 'app/common/semitones';
import { GripScorerService } from 'app/services/grips/grip-scorer.service';
import { ChordProgressionService } from 'app/services/chords/chord-progression.service';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { combineLatest } from 'rxjs';
import { Degree, HarmonicFunctionsService } from 'app/services/chords/harmonic-functions.service';
import { SongSheetsService } from 'app/services/song-sheets.service';
import { PlaybackService } from 'app/services/playback.service';

interface GripSettings {
  minFretToConsider?: number;
  maxFretToConsider?: number;
  minimalPlayableStrings?: number;
  allowBarree?: boolean;
  allowInversions?: boolean;
  allowIncompleteChords?: boolean;
  allowMutedStringsInside?: boolean;
  allowDuplicateNotes?: boolean;
}

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

  activeChord: ExtendedChord | null = null
  progressions: Chord[][] = [];

  selectedSheetId: string | null = null;

  readonly BASE_MAJOR_PROGRESSION: Degree[] = ['I','V','vi','IV']
  readonly BASE_MINOR_PROGRESSION: Degree[] = ['i','VI','III','VII']

  gripSettings: GripSettings = {
    minFretToConsider: 1,
    maxFretToConsider: 12,
    minimalPlayableStrings: 3,
    allowBarree: true,
    allowInversions: false,
    allowIncompleteChords: false,
    allowMutedStringsInside: false,
    allowDuplicateNotes: false
  };

  currentChord: string | null = null;

  constructor(
    private gripGenerator: GripGeneratorService,
    private chordService: ChordService,
    private gripScorer: GripScorerService,
    private chordProgression: ChordProgressionService,
    private harmonicFunctions: HarmonicFunctionsService,
    private songSheets: SongSheetsService,
    private playback: PlaybackService,
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
          this.activeChord = analysis;

          const grips = this.gripGenerator.generateGrips(this.activeChord, this.gripSettings);
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
      this.selectedModifiers = this.selectedModifiers
        .filter(m => {
          if (isModifierSubset(m, modifier)) {
            return modifier === m;
          }
          return true;
        });
    }
  }

  resetModifiers() {
    this.selectedModifiers = [];
  }

  updateChord() {
    this.closeChordBuilder();
    const chord: Chord = { root: this.selectedRoot, modifiers: [...this.selectedModifiers] };
    const chordString = this.getChordQueryString(chord);

    if (this.currentChord === chordString && this.activeChord) {
      // If already on the same chord, just refresh grips
      const grips = this.gripGenerator.generateGrips(this.activeChord, this.gripSettings);
      this.grips = this.gripScorer.sortGrips(grips);
    } else {
      this.router.navigate(['/chord', chordString], { queryParams: {} });
    }
  }

  getPinnedSongSheet() {
    return this.songSheets.getPinnedSongSheet();
  }

  addGripToPinned(grip: any) {
    const pinned = this.songSheets.getPinnedSongSheet();
    if (!pinned) return;
    this.songSheets.addGrip({
      id: 'grip-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      chordName: this.currentChord ?? '',
      grip
    });
  }

  async playChord(grip: TunedGrip) {
    try {
      // Use the pre-calculated notes from TunedGrip
      // Filter out muted strings (null notes)
      const notes = grip.notes.filter((note: string | null) => note !== null) as string[];
      
      if (notes.length > 0) {
        await this.playback.playChordFromNotes(notes);
      } else {
        console.warn('No playable notes found in grip');
      }
    } catch (error) {
      console.error('Error playing chord:', error);
    }
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
    // Compose a string that can be parsed by chordService
    return chordToString(chord);
  }

  chordEquals(a: Chord, b: Chord) {
    return chordEquals(a, b);
  }

  tryParseChord(input: string): ExtendedChord | null {
    try {
      return this.chordService.parseChord(input);
    } catch {
      console.error('Failed to parse chord:', input);
      return null;
    }
  }

  getModifierState(modifier: Modifier) {
    const isChecked = this.isModifierChecked(modifier);
    const isSubset = this.isModifierSubset(modifier);
    const isConflict = this.isModifierConflict(modifier);
    const isDisabled = isConflict || isSubset;

    return { isChecked, isDisabled, isConflict, isSubset };
  }

  isModifierChecked(modifier: Modifier): boolean {
    return this.selectedModifiers.includes(modifier);
  }

  isModifierSubset(modifier: Modifier): boolean {
    const otherModifiers = this.selectedModifiers.filter(m => m !== modifier);
    if (otherModifiers.length === 0) return false;

    return otherModifiers.some(m => isModifierSubset(modifier, m));
  }

  isModifierConflict(modifier: Modifier): boolean {
    const canAdd = canAddModifier(this.selectedModifiers, modifier) === true; // returns string for false
    return !canAdd;
  }

  /**
   * Generates step-by-step explanation of how chord notes were calculated
   */
  generateChordExplanation(): { step: string; notes: Semitone[]; description: string }[] {
    if (!this.activeChord) return [];

    const steps: { step: string; notes: Semitone[]; description: string }[] = [];
    const root = this.activeChord.root;
    
    // Step 1: Base major triad (no modifiers)
    const baseTriad = this.chordService.calculateNotes(root, []);
    steps.push({
      step: 'Base major triad',
      notes: [...baseTriad.notes],
      description: `Start with the basic major triad: ${baseTriad.notes.join(' - ')}`
    });

    // Step 2: Apply each modifier one by one
    let currentModifiers: Modifier[] = [];
    let previousNotes = baseTriad.notes;
    
    for (const modifier of this.activeChord.modifiers) {
      currentModifiers.push(modifier);
      const chordWithModifier = this.chordService.calculateNotes(root, currentModifiers);
      const currentNotes = chordWithModifier.notes;
      
      // Identify changed notes
      const addedNotes = currentNotes.filter(note => !previousNotes.includes(note));
      const removedNotes = previousNotes.filter(note => !currentNotes.includes(note));
      
      // Create description with highlighted changes
      let notesDisplay = currentNotes.map(note => {
        if (addedNotes.includes(note)) {
          return `<strong>${note}</strong>`;
        }
        return note;
      }).join(' - ');
      
      // Add removed notes info if any
      let changeInfo = '';
      if (removedNotes.length > 0 && addedNotes.length > 0) {
        changeInfo = ` (replaced ${removedNotes.map(n => `<strong>${n}</strong>`).join(', ')} with ${addedNotes.map(n => `<strong>${n}</strong>`).join(', ')})`;
      } else if (removedNotes.length > 0) {
        changeInfo = ` (removed ${removedNotes.map(n => `<strong>${n}</strong>`).join(', ')})`;
      } else if (addedNotes.length > 0) {
        changeInfo = ` (added ${addedNotes.map(n => `<strong>${n}</strong>`).join(', ')})`;
      } else {
        changeInfo = ' (no changes)';
      }
      
      steps.push({
        step: `Apply "${modifier}"`,
        notes: [...currentNotes],
        description: `${getModifierDescription(modifier)} → ${notesDisplay}${changeInfo}`
      });
      
      previousNotes = currentNotes;
    }

    // Step 3: Add bass note if present
    if (this.activeChord.bass && this.activeChord.bass !== root) {
      const bassNote = this.activeChord.bass;
      const finalNotes = [bassNote, ...this.activeChord.notes.filter(n => n !== bassNote)];
      const notesDisplay = finalNotes.map(note => 
        note === bassNote ? `<strong>${note}</strong>` : note
      ).join(' - ');
      
      steps.push({
        step: 'Add bass note',
        notes: [...finalNotes],
        description: `Add <strong>${bassNote}</strong> as the bass note (slash chord) → ${notesDisplay}`
      });
    }

    return steps;
  }
}
