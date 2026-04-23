import { Component, OnDestroy, inject, input, output } from '@angular/core';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { ModalService } from '@/app/core/services/modal.service';
import { DialogService } from '@/app/core/services/dialog.service';
import { NotificationService } from '@/app/core/services/notification.service';
import { transpose } from '@/app/core/music/semitones';
import { PatternPlaybackService, PatternPlaybackState } from '@/app/features/patterns/services/pattern-playback.service';
import { PlayingPattern } from '@/app/features/patterns/services/playing-patterns.model';
import { PatternLibrarySelectorModalComponent } from '@/app/features/patterns/ui/pattern-library-selector-modal/pattern-library-selector-modal.component';
import { PlayingPatternEditorModalComponent } from '@/app/features/patterns/ui/playing-pattern-editor-modal/playing-pattern-editor-modal.component';
import { PlayingActionsComponent, PlayingActionsNotationContext } from '@/app/features/patterns/ui/playing-actions/playing-actions.component';
import { SongPartPlaybackService } from '@/app/features/sheets/services/song-part-playback.service';
import { SongSheetPattern, SongSheetWithData } from '@/app/features/sheets/services/song-sheets.model';
import { SongSheetsService } from '@/app/features/sheets/services/song-sheets.service';
import { Subscription } from 'rxjs';
import {
  buildGripByIdMap,
  cloneSongSheetPattern,
  createEmptySongSheetPattern,
  toSongSheetPattern
} from '../song-sheet.helpers';
import { SongSheetChoice, SongSheetChoiceModalComponent, SongSheetChoiceModalData } from '../song-sheet-choice-modal.component';

@Component({
  selector: 'app-song-sheet-patterns-tab',
  standalone: true,
  imports: [DragDropModule, PlayingActionsComponent],
  templateUrl: './song-patterns-tab.component.html',
  styleUrl: './song-patterns-tab.component.scss'
})
export class SongPatternsTabComponent implements OnDestroy {
  readonly sheet = input.required<SongSheetWithData>();
  readonly changed = output<void>();

  patternPlaybackState = { status: 'idle' } as PatternPlaybackState;
  private readonly patternPlayback = inject(PatternPlaybackService);
  private readonly songPartPlayback = inject(SongPartPlaybackService);
  private readonly songSheetService = inject(SongSheetsService);
  private readonly dialogService = inject(DialogService);
  private readonly modalService = inject(ModalService);
  private readonly notificationService = inject(NotificationService);
  private readonly patternPlaybackSubscription: Subscription;

  constructor() {
    this.patternPlaybackState = this.patternPlayback.getSnapshot();
    this.patternPlaybackSubscription = this.patternPlayback.state$.subscribe(state => {
      this.patternPlaybackState = state;
    });
  }

  ngOnDestroy(): void {
    this.patternPlaybackSubscription.unsubscribe();
  }

  async addPatterns(): Promise<void> {
    const choices: SongSheetChoice[] = [];
    if (this.sheet().patterns.length > 0) {
      choices.push({ value: 'create-new', text: 'Create new' });
    } else {
      choices.push({ value: 'create-new', text: 'Create first pattern' });
    }
    choices.push({ value: 'from-library', text: 'Import from library' });

    const choice = await this.openChoiceDialog({
      title: 'Add Pattern',
      choices
    });

    if (choice === 'from-library') {
      const importedPatterns = await this.importPatternsFromLibrary();
      if (importedPatterns.length > 0) {
        this.changed.emit();
      }
      return;
    }

    if (choice === 'create-new') {
      const createdPattern = await this.createPatternAndAddToSheet();
      if (createdPattern) {
        this.changed.emit();
      }
    }
  }

  async playPattern(pattern: SongSheetPattern): Promise<void> {
    try {
      this.songPartPlayback.stopMeasurePreview();
      this.songPartPlayback.stopSongPart();
      const tuning = this.sheet().tuning.map(note => transpose(note, this.sheet().capodaster));
      await this.patternPlayback.togglePatternPreview(pattern, tuning, undefined, this.sheet().tempo);
    } catch (error) {
      console.error('Error playing playing pattern:', error);
    }
  }

  async copyPattern(patternId: string): Promise<void> {
    const copy = await this.songSheetService.duplicatePattern(this.sheet().id, patternId, 'Copy');
    this.notificationService.success(`Copied pattern "${copy.name || 'Untitled Pattern'}"`);
    this.changed.emit();
  }

  async removePattern(patternId: string): Promise<void> {
    try {
      await this.songSheetService.removePattern(this.sheet().id, patternId);
      this.changed.emit();
    } catch (error) {
      await this.dialogService.alert(
        'This pattern is still used in a song part. Remove or change those part items first.',
        'Pattern In Use',
        'OK',
        { variant: 'warning' }
      );
    }
  }

  async dropPattern(event: CdkDragDrop<SongSheetPattern[]>): Promise<void> {
    if (event.previousIndex === event.currentIndex) {
      return;
    }

    moveItemInArray(this.sheet().patterns, event.previousIndex, event.currentIndex);
    await this.songSheetService.movePattern(this.sheet().id, event.previousIndex, event.currentIndex);
    this.changed.emit();
  }

  isPatternPlaybackActive(pattern: SongSheetPattern): boolean {
    return this.patternPlaybackState.status === 'playing' && this.patternPlaybackState.patternId === pattern.id;
  }

  getPatternMeasureNotationContext(pattern: SongSheetPattern, measureIndex: number): PlayingActionsNotationContext {
    return {
      timeSignature: pattern.measures[measureIndex].timeSignature,
      actionGrips: (pattern.actionGrips ?? []).filter(grip => grip.measureIndex === measureIndex),
      gripById: buildGripByIdMap(this.sheet())
    };
  }

  getPatternMeasureNotationContexts(pattern: SongSheetPattern): PlayingActionsNotationContext[] {
    return pattern.measures.map((_, measureIndex) => this.getPatternMeasureNotationContext(pattern, measureIndex));
  }

  private async openChoiceDialog(context: SongSheetChoiceModalData): Promise<string | undefined> {
    const modalRef = this.modalService.show(SongSheetChoiceModalComponent, {
      data: context,
      width: '420px',
      maxWidth: '95vw',
      closeOnBackdropClick: true
    });

    return modalRef.afterClosed();
  }

  private async importPatternsFromLibrary(): Promise<SongSheetPattern[]> {
    const modalRef = this.modalService.show(PatternLibrarySelectorModalComponent, {
      width: '95vw',
      height: '90vh',
      maxHeight: '90vh',
      panelClass: 'modal-xl',
      closeOnBackdropClick: false
    });

    const result = await modalRef.afterClosed();
    if (!result) {
      return [];
    }

    const importedPatterns = result.patterns.map((pattern: PlayingPattern) => toSongSheetPattern(pattern));
    await this.songSheetService.addPatterns(importedPatterns, this.sheet().id);
    return importedPatterns;
  }

  private async createPatternAndAddToSheet(): Promise<SongSheetPattern | undefined> {
    const createdPattern = createEmptySongSheetPattern();
    const result = await this.openPatternEditor(createdPattern);
    if (!result) {
      return undefined;
    }

    const localPattern = toSongSheetPattern(result);
    await this.songSheetService.addPattern(localPattern, this.sheet().id);
    return localPattern;
  }

  private async openPatternEditor(pattern: SongSheetPattern): Promise<SongSheetPattern | undefined> {
    const modalRef = this.modalService.show(PlayingPatternEditorModalComponent, {
      width: '95vw',
      height: '90vh',
      maxHeight: '90vh',
      panelClass: 'modal-xl',
      closeOnBackdropClick: false
    });

    if (modalRef.componentInstance) {
      modalRef.componentInstance.pattern = cloneSongSheetPattern(pattern);
    }

    const result = await modalRef.afterClosed();
    return result ? cloneSongSheetPattern(result) : undefined;
  }
}
