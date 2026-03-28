import {Component, computed, EventEmitter, model, OnInit, Output} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import type {DissonanceProfile, GripGeneratorOptions} from '@/app/features/grips/services/grips/grip-generator.service';
import {GripGeneratorService} from '@/app/features/grips/services/grips/grip-generator.service';
import {Grip, stringifyGrip, TunedGrip} from '@/app/features/grips/services/grips/grip.model';
import {ChordService} from '@/app/features/grips/services/chords/chord.service';
import {GripDiagramComponent} from '@/app/core/ui/grip-diagram/grip-diagram.component';
import {Chord} from '@/app/core/music/chords';
import {GripScorerService} from '@/app/features/grips/services/grips/grip-scorer.service';
import {RouterModule} from '@angular/router';
import {PlaybackService} from '@/app/core/services/playback.service';
import {ModalService} from '@/app/core/services/modal.service';
import {ChordSelectorComponent} from '@/app/core/ui/chord-selector/chord-selector.component';
import {
  GripGenerationSettingsModalComponent
} from '@/app/features/grips/ui/grip-generation-settings-modal/grip-generation-settings-modal.component';

export interface GripSelectorResult {
  chord: Chord;
  grips: TunedGrip[];
}

@Component({
  selector: 'app-grip-selector',
  standalone: true,
  imports: [CommonModule, FormsModule, GripDiagramComponent, RouterModule, ChordSelectorComponent],
  templateUrl: './grip-selector.component.html',
  styleUrls: ['./grip-selector.component.scss']
})
export class GripSelectorComponent implements OnInit {
  @Output() selectedGripsChange = new EventEmitter<GripSelectorResult>();

  chord = model.required<Chord | null>();
  chordWithNotes = computed(() => {
    const chordValue = this.chord();

    if (chordValue) {
      return this.chordService.calculateNotes(chordValue);
    }

    return null;
  });

  grips: TunedGrip[] = [];
  isGeneratingGrips: boolean = false;
  private selectedGripKeys = new Set<string>();

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

  constructor(
    private gripGenerator: GripGeneratorService,
    private chordService: ChordService,
    private gripScorer: GripScorerService,
    private playback: PlaybackService,
    private modalService: ModalService
  ) { }

  ngOnInit() {
    this.regenerateGrips();
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
    if (!this.chordWithNotes()) return;

    this.isGeneratingGrips = true;

    // Use setTimeout to allow UI to update with loading indicator
    setTimeout(() => {
      try {
        const chordValue = this.chordWithNotes();
        if (!chordValue) {
          return;
        }

        const grips = this.gripGenerator.generateGrips(chordValue, this.gripSettings);
        this.grips = this.sortGripsByFretAndScore(grips);
        this.reconcileSelectionWithGeneratedGrips();
      } finally {
        this.isGeneratingGrips = false;
      }
    }, 10);
  }

  isSelected(grip: TunedGrip): boolean {
    return this.selectedGripKeys.has(this.getGripKey(grip));
  }

  toggleSelection(grip: TunedGrip, isSelected: boolean) {
    const gripKey = this.getGripKey(grip);

    if (isSelected) {
      this.selectedGripKeys.add(gripKey);
    } else {
      this.selectedGripKeys.delete(gripKey);
    }

    this.emitSelectedGrips();
  }

  onGripCardClick(grip: TunedGrip) {
    this.toggleSelection(grip, !this.isSelected(grip));
  }

  onGripCardKeydown(event: KeyboardEvent, grip: TunedGrip) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.onGripCardClick(grip);
    }
  }

  private emitSelectedGrips() {
    const chordValue = this.chord();
    if (!chordValue) {
      return;
    }

    const selectedGrips = this.grips.filter(grip => this.selectedGripKeys.has(this.getGripKey(grip)));
    this.selectedGripsChange.emit({
      chord: chordValue,
      grips: selectedGrips
    });
  }

  private reconcileSelectionWithGeneratedGrips() {
    const availableGripKeys = new Set(this.grips.map(grip => this.getGripKey(grip)));
    this.selectedGripKeys = new Set(
      [...this.selectedGripKeys].filter(gripKey => availableGripKeys.has(gripKey))
    );
    this.emitSelectedGrips();
  }

  private getGripKey(grip: Grip): string {
    return stringifyGrip(grip);
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
      return;
    }

    this.regenerateGrips();
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

  trackGripBy(grip: TunedGrip): string {
    return this.getGripKey(grip);
  }
}
