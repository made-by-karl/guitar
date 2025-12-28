import { Component, OnInit, ViewChild, TemplateRef, ViewContainerRef } from '@angular/core';
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
import { ModalService, ModalRef } from 'app/services/modal.service';

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
  selector: 'app-chord',
  standalone: true,
  imports: [CommonModule, FormsModule, GripDiagramComponent, RouterModule],
  templateUrl: './chord.component.html',
  styleUrls: ['./chord.component.scss']
})
export class ChordComponent implements OnInit {
  @ViewChild('modifierModal') modifierModalTemplate!: TemplateRef<any>;
  @ViewChild('settingsModal') settingsModalTemplate!: TemplateRef<any>;
  
  grips: TunedGrip[] = [];
  modifiers: Modifier[] = [...MODIFIERS];
  bassNotes: Semitone[] = [...SEMITONES];
  roots: Semitone[] = [...SEMITONES];
  selectedRoot: Semitone | null = null;
  selectedModifiers: Modifier[] = [];
  selectedBass: Semitone | null = null;

  activeChord: ExtendedChord | null = null
  progressions: Chord[][] = [];
  isGeneratingGrips: boolean = false;
  
  private modifierModalRef: ModalRef | null = null;
  private settingsModalRef: ModalRef | null = null;

  selectedSheetId: string | null = null;
  pinnedSheet: any = undefined;
  pinnedGripIds: Set<string> = new Set();

  readonly BASE_MAJOR_PROGRESSION: Degree[] = ['I', 'V', 'vi', 'IV']
  readonly BASE_MINOR_PROGRESSION: Degree[] = ['i', 'VI', 'III', 'VII']

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
    private modalService: ModalService,
    private viewContainerRef: ViewContainerRef
  ) { }

  ngOnInit() {
    this.loadPinnedSheet();
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

          this.regenerateGrips();

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
      } else {
        // No chord selected - reset to initial state
        this.selectedRoot = null;
        this.selectedModifiers = [];
        this.selectedBass = null;
        this.activeChord = null;
        this.grips = [];
        this.progressions = [];
      }
    });
  }

  async loadPinnedSheet() {
    this.pinnedSheet = await this.songSheets.getPinnedSongSheet();
    if (this.pinnedSheet) {
      const sheet = await this.songSheets.getById(this.pinnedSheet.id);
      this.pinnedGripIds = new Set(sheet?.grips?.map(g => g.gripId) || []);
    } else {
      this.pinnedGripIds = new Set();
    }
  }

  getPinnedSongSheet() {
    return this.pinnedSheet;
  }

  private selectProgression(chord: Chord) {
    if (chord.modifiers.length === 0) return this.BASE_MAJOR_PROGRESSION;
    if (chord.modifiers.length === 1 && chord.modifiers[0] === 'm') return this.BASE_MINOR_PROGRESSION;
    return [];
  }

  openModifierModal() {
    this.modifierModalRef = this.modalService.showTemplate(
      this.modifierModalTemplate,
      this.viewContainerRef,
      {
        width: '800px',
        maxHeight: '90vh',
        closeOnBackdropClick: true
      }
    );
  }

  closeModifierModal() {
    if (this.modifierModalRef) {
      this.modifierModalRef.close();
      this.modifierModalRef = null;
    }
  }

  openSettingsModal() {
    this.settingsModalRef = this.modalService.showTemplate(
      this.settingsModalTemplate,
      this.viewContainerRef,
      {
        width: '600px',
        maxHeight: '90vh',
        closeOnBackdropClick: true
      }
    );
  }

  closeSettingsModal() {
    if (this.settingsModalRef) {
      this.settingsModalRef.close();
      this.settingsModalRef = null;
    }
  }

  applySettingsAndRegenerate() {
    this.closeSettingsModal();
    this.regenerateGrips();
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
    // Immediately update chord and URL when modifier changes
    this.updateChord();
  }

  resetModifiers() {
    this.selectedModifiers = [];
    // Immediately update chord and URL when modifiers are reset
    this.updateChord();
  }

  updateChord() {
    // Don't update if no root is selected
    if (!this.selectedRoot) {
      return;
    }
    
    const chord: Chord = { root: this.selectedRoot, modifiers: [...this.selectedModifiers] };
    const chordString = this.getChordQueryString(chord);

    // Always navigate to update URL (which will trigger ngOnInit subscription to regenerate grips)
    this.router.navigate(['/chord', chordString], { queryParams: {} });
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

  onRootChange() {
    // If user selects "Select a chord..." (null), navigate to base /chord route
    if (this.selectedRoot === null) {
      this.router.navigate(['/chord']);
      return;
    }
    this.updateChord();
  }

  onBassChange() {
    // Ensure that any invalid values get converted to null
    const bassValue = this.selectedBass as any;
    if (!bassValue || bassValue === 'null' || bassValue === 'undefined' || bassValue === '') {
      this.selectedBass = null;
    }
    this.updateChord();
  }

  async addGripToPinnedSheet(grip: Grip) {
    if (!this.pinnedSheet) return;
    await this.songSheets.addGrip({
      gripId: stringifyGrip(grip),
      chordName: this.currentChord ?? ''
    });
    await this.loadPinnedSheet();
  }

  async removeGripFromPinnedSheet(grip: Grip) {
    if (!this.pinnedSheet) return;
    
    const gripId = stringifyGrip(grip);
    if (this.pinnedGripIds.has(gripId)) {
      await this.songSheets.removeGrip(this.pinnedSheet.id, gripId);
      await this.loadPinnedSheet();
    }
  }

  isGripInPinnedSheet(grip: Grip): boolean {
    return this.pinnedGripIds.has(stringifyGrip(grip));
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
    // For the current chord being edited, use selectedBass
    const bass = (chord === this.activeChord || (this.selectedRoot && chordEquals(chord, { root: this.selectedRoot, modifiers: this.selectedModifiers }))) 
      ? this.selectedBass 
      : null;
    return chordToString(chord, bass);
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
