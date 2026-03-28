import {Component, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import type {DissonanceProfile, GripGeneratorOptions} from '@/app/features/grips/services/grips/grip-generator.service';
import {GripGeneratorService} from '@/app/features/grips/services/grips/grip-generator.service';
import {Grip, stringifyGrip, TunedGrip} from '@/app/features/grips/services/grips/grip.model';
import {ChordService, ChordWithNotes} from '@/app/features/grips/services/chords/chord.service';
import {GripDiagramComponent} from '@/app/core/ui/grip-diagram/grip-diagram.component';
import {Chord, chordEquals, chordToString} from '@/app/core/music/chords';
import {getModifierDescription, Modifier} from '@/app/core/music/modifiers';
import {Semitone} from '@/app/core/music/semitones';
import {GripScorerService} from '@/app/features/grips/services/grips/grip-scorer.service';
import {ChordProgressionService} from '@/app/features/grips/services/chords/chord-progression.service';
import {ActivatedRoute, Router, RouterModule} from '@angular/router';
import {combineLatest} from 'rxjs';
import {Degree, HarmonicFunctionsService} from '@/app/features/grips/services/chords/harmonic-functions.service';
import {PlaybackService} from '@/app/core/services/playback.service';
import {ModalService} from '@/app/core/services/modal.service';
import {ChordSelectorComponent} from '@/app/core/ui/chord-selector/chord-selector.component';
import {
  GripGenerationSettingsModalComponent
} from '@/app/features/grips/ui/grip-generation-settings-modal/grip-generation-settings-modal.component';

@Component({
  selector: 'app-chord',
  standalone: true,
  imports: [CommonModule, FormsModule, GripDiagramComponent, RouterModule, ChordSelectorComponent],
  templateUrl: './chord.component.html',
  styleUrls: ['./chord.component.scss']
})
export class ChordComponent implements OnInit {
  grips: TunedGrip[] = [];

  activeChord: ChordWithNotes | null = null
  progressions: Chord[][] = [];
  isGeneratingGrips: boolean = false;

  readonly BASE_MAJOR_PROGRESSION: Degree[] = ['I', 'V', 'vi', 'IV']
  readonly BASE_MINOR_PROGRESSION: Degree[] = ['i', 'VI', 'III', 'VII']

  dissonanceProfiles: { value: DissonanceProfile; label: string }[] = [
    { value: 'harmonic', label: 'Harmonic (strict)' },
    { value: 'neutral', label: 'Neutral' },
    { value: 'dissonant', label: 'Dissonant (permissive)' },
  ];

  gripSettings: GripGeneratorOptions = {
    minFretToConsider: 1,
    maxFretToConsider: 12,
    minimalPlayableStrings: 3,
    allowBarre: true,
    allowInversions: false,
    allowIncompleteChords: false,
    allowMutedStringsInside: false,
    allowDuplicateNotes: false,
    dissonanceProfile: 'neutral'
  };

  currentChord: string | null = null;

  constructor(
    private gripGenerator: GripGeneratorService,
    private chordService: ChordService,
    private gripScorer: GripScorerService,
    private chordProgression: ChordProgressionService,
    private harmonicFunctions: HarmonicFunctionsService,
    private playback: PlaybackService,
    private router: Router,
    private route: ActivatedRoute,
    private modalService: ModalService
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
          this.activeChord = analysis;

          this.regenerateGrips();

          this.progressions = this.getProgressions(analysis);
        }
      } else {
        // No chord selected - reset to initial state
        this.activeChord = null;
        this.grips = [];
        this.progressions = [];
      }
    });
  }

  private getProgressions(selectedChord: ChordWithNotes): Chord[][] {
    const progressions: Chord[][] = [];
    const inHarmonics = this.harmonicFunctions.find(selectedChord);

    for (const entry of inHarmonics) {
      const degrees = this.selectProgression(entry.tonic);
      if (degrees.includes(entry.degree)) {
        progressions.push(this.chordProgression.getProgression(entry.tonic, degrees));
      }
    }

    progressions.sort((a, b) => a.findIndex(x => chordEquals(x, selectedChord)) - b.findIndex(x => chordEquals(x, selectedChord)));

    const uniqueProgressions = new Set<string>();
    return progressions.filter(seq => {
      const seqString = seq.map(x => chordToString(x)).sort().join('-');
      if (uniqueProgressions.has(seqString)) {
        return false;
      }

      uniqueProgressions.add(seqString);
      return true;
    });
  }

  private selectProgression(chord: Chord) {
    if (chord.modifiers.length === 0) return this.BASE_MAJOR_PROGRESSION;
    if (chord.modifiers.length === 1 && chord.modifiers[0] === 'm') return this.BASE_MINOR_PROGRESSION;
    return [];
  }

  async openSettingsModal() {
    const modalRef = this.modalService.show(GripGenerationSettingsModalComponent, {
      width: '600px',
      maxHeight: '90vh',
      closeOnBackdropClick: true
    });

    modalRef.componentInstance.initialize({
      settings: this.gripSettings,
      dissonanceProfiles: this.dissonanceProfiles
    });

    const updatedSettings = await modalRef.afterClosed();

    if (updatedSettings) {
      this.gripSettings = updatedSettings;
      this.regenerateGrips();
    }
  }

  private regenerateGrips() {
    if (!this.activeChord) return;

    this.isGeneratingGrips = true;

    // Use setTimeout to allow UI to update with loading indicator
    setTimeout(() => {
      try {
        const grips = this.gripGenerator.generateGrips(this.activeChord!, this.gripSettings);
        this.grips = this.sortGripsByFretAndScore(grips);
      } finally {
        this.isGeneratingGrips = false;
      }
    }, 10);
  }

  private sortGripsByFretAndScore(grips: TunedGrip[]): TunedGrip[] {
    return grips.sort((a, b) => {
      // Get the minimum fret for each grip (excluding open strings and muted strings)
      const minFretA = this.getMinFret(a);
      const minFretB = this.getMinFret(b);

      // First, sort by fret position
      if (minFretA !== minFretB) {
        return minFretA - minFretB;
      }

      // If frets are equal, sort by score (lower score is better)
      const scoreA = this.gripScorer.scoreGrip(a);
      const scoreB = this.gripScorer.scoreGrip(b);
      return scoreA - scoreB;
    });
  }

  private getMinFret(grip: TunedGrip): number {
    let minFret = Infinity;

    for (const string of grip.strings) {
      if (string === 'x' || string === 'o') continue;

      if (Array.isArray(string)) {
        for (const placement of string) {
          if (placement.fret < minFret) {
            minFret = placement.fret;
          }
        }
      }
    }

    // If no frets found (all open strings), return 0
    return minFret === Infinity ? 0 : minFret;
  }

  onChordChange(chord: Chord | null) {
    if (!chord) {
      this.activeChord = null;
      this.router.navigate(['/grips']);
      return;
    }

    this.activeChord = this.chordService.calculateNotes(chord);
    this.router.navigate(['/grips', chordToString(chord)], { queryParams: {} });
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

  getChordQueryString(chord: Chord): string {
    // For progression links, use the chord as-is (no bass note)
    // For the current chord being edited, include selectedChord.bass
    const selection = this.activeChord;
    const isCurrentSelectionBase = !!selection && chordEquals(chord, {
      root: selection.root,
      modifiers: selection.modifiers,
      bass: undefined
    });
    return chordToString({
      ...chord,
      bass: isCurrentSelectionBase ? selection?.bass : undefined
    });
  }

  chordEquals(a: Chord, b: Chord) {
    return chordEquals(a, b);
  }

  tryParseChord(input: string): ChordWithNotes | null {
    try {
      return this.chordService.calculateNotes(input);
    } catch {
      console.error('Failed to parse chord:', input);
      return null;
    }
  }

  /**
   * Generates step-by-step explanation of how chord notes were calculated
   */
  generateChordExplanation(): { step: string; notes: Semitone[]; description: string }[] {
    if (!this.activeChord) return [];

    const steps: { step: string; notes: Semitone[]; description: string }[] = [];
    const root = this.activeChord.root;

    // Step 1: Base major triad (no modifiers)
    const baseTriad = this.chordService.calculateNotes({ root, modifiers: [] });
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
      const chordWithModifier = this.chordService.calculateNotes({ root, modifiers: currentModifiers });
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

  private getGripKey(grip: Grip): string {
    return stringifyGrip(grip);
  }

  trackGripBy(grip: TunedGrip): string {
    return this.getGripKey(grip);
  }
}
