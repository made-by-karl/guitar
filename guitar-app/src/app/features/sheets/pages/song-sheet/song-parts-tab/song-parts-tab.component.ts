import { Component, OnDestroy, computed, inject, input, output } from '@angular/core';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { DialogService } from '@/app/core/services/dialog.service';
import { ModalService } from '@/app/core/services/modal.service';
import { PlayingPatternActionGrip } from '@/app/features/patterns/services/playing-patterns.model';
import { PlayingActionsComponent, PlayingActionsNotationContext } from '@/app/features/patterns/ui/playing-actions/playing-actions.component';
import { ResolvedSongPartMeasure, SongPart, SongPartPatternItem, SongSheetWithData } from '@/app/features/sheets/services/song-sheets.model';
import { SongPartPlaybackService, SongSheetPlaybackState } from '@/app/features/sheets/services/song-part-playback.service';
import { SongSheetsService } from '@/app/features/sheets/services/song-sheets.service';
import { Subscription } from 'rxjs';
import {
  buildGripByIdMap,
  canForwardPart,
  canRewindPart,
  cloneSongPart,
  createEmptySongPart,
  getPartMeasureCounter,
  isPartPlaybackActive,
  isPartPlaybackPaused
} from '../song-sheet.helpers';
import { SongPartEditorComponent } from '../song-part-editor/song-part-editor.component';

@Component({
  selector: 'app-song-sheet-parts-tab',
  standalone: true,
  imports: [DragDropModule, PlayingActionsComponent],
  templateUrl: './song-parts-tab.component.html',
  styleUrl: './song-parts-tab.component.scss'
})
export class SongPartsTabComponent implements OnDestroy {
  readonly sheet = input.required<SongSheetWithData>();
  readonly changed = output<void>();

  private readonly songSheetService = inject(SongSheetsService);
  private readonly dialogService = inject(DialogService);
  private readonly modalService = inject(ModalService);
  private readonly songPartPlayback = inject(SongPartPlaybackService);
  private readonly patternNames = computed(() => (
    new Map(this.sheet().patterns.map(pattern => [pattern.id, pattern.name || 'Untitled Pattern']))
  ));
  playbackState = { type: 'none', status: 'idle' } as SongSheetPlaybackState;
  private readonly playbackStateSubscription: Subscription;

  constructor() {
    this.playbackState = this.songPartPlayback.getSnapshot();
    this.playbackStateSubscription = this.songPartPlayback.state$.subscribe(state => {
      this.playbackState = state;
    });
  }

  ngOnDestroy(): void {
    this.playbackStateSubscription.unsubscribe();
  }

  async addPart(): Promise<void> {
    await this.openPartEditor(null);
  }

  async editPart(partIndex: number): Promise<void> {
    await this.openPartEditor(partIndex);
  }

  async copyPart(partIndex: number): Promise<void> {
    await this.songSheetService.duplicatePart(this.sheet().id, partIndex);
    this.changed.emit();
  }

  async removePart(partIndex: number): Promise<void> {
    const confirmed = await this.dialogService.confirm(
      'Are you sure you want to remove this song part?',
      'Remove Song Part',
      'Remove',
      'Cancel',
      { variant: 'danger' }
    );

    if (!confirmed) {
      return;
    }

    await this.songSheetService.removePart(this.sheet().id, partIndex);
    this.changed.emit();
  }

  async dropPart(event: CdkDragDrop<SongPart[]>): Promise<void> {
    if (event.previousIndex === event.currentIndex) {
      return;
    }

    moveItemInArray(this.sheet().parts, event.previousIndex, event.currentIndex);
    await this.songSheetService.movePart(this.sheet().id, event.previousIndex, event.currentIndex);
    this.changed.emit();
  }

  async playPart(part: SongPart): Promise<void> {
    await this.songPartPlayback.playSongPart(this.sheet(), part);
  }

  pausePart(): void {
    this.songPartPlayback.pauseSongPart();
  }

  resumePart(): void {
    this.songPartPlayback.resumeSongPart();
  }

  stopPart(): void {
    this.songPartPlayback.stopSongPart();
  }

  rewindPart(): void {
    this.songPartPlayback.seekSongPartMeasure(-1);
  }

  forwardPart(): void {
    this.songPartPlayback.seekSongPartMeasure(1);
  }

  getPatternName(patternId: string): string {
    return this.patternNames().get(patternId) || 'Unknown Pattern';
  }

  hasPattern(patternId: string): boolean {
    return this.patternNames().has(patternId);
  }

  getPartItemMeasures(item: SongPartPatternItem): ResolvedSongPartMeasure[] {
    return this.songSheetService.resolvePartItem(this.sheet(), item);
  }

  getMeasureNotationContext(measure: ResolvedSongPartMeasure): PlayingActionsNotationContext {
    return {
      timeSignature: measure.measure.timeSignature,
      actionGrips: this.getEffectiveActionGrips(measure),
      gripById: buildGripByIdMap(this.sheet())
    };
  }

  hasMeasureNotes(measure: ResolvedSongPartMeasure): boolean {
    return measure.notes.trim().length > 0;
  }

  hasMeasureLyrics(measure: ResolvedSongPartMeasure): boolean {
    return measure.lyrics.trim().length > 0;
  }

  isPartPlaybackActive(part: SongPart): boolean {
    return isPartPlaybackActive(this.playbackState, part.id);
  }

  isPartPlaybackPaused(part: SongPart): boolean {
    return isPartPlaybackPaused(this.playbackState, part.id);
  }

  getPartMeasureCounter(part: SongPart): string {
    const totalMeasures = this.songSheetService.resolvePartMeasures(this.sheet(), part).length;
    return getPartMeasureCounter(this.playbackState, part.id, totalMeasures);
  }

  canRewindPart(part: SongPart): boolean {
    return canRewindPart(this.playbackState, part.id);
  }

  canForwardPart(part: SongPart): boolean {
    return canForwardPart(this.playbackState, part.id);
  }

  private getEffectiveActionGrips(measure: ResolvedSongPartMeasure): PlayingPatternActionGrip[] {
    const actionGripsByIndex = new Map<number, PlayingPatternActionGrip>();

    for (const actionGrip of measure.patternActionGrips) {
      actionGripsByIndex.set(actionGrip.actionIndex, { ...actionGrip });
    }

    for (const actionGrip of measure.actionGrips) {
      actionGripsByIndex.set(actionGrip.actionIndex, { ...actionGrip });
    }

    return [...actionGripsByIndex.values()].sort((left, right) => left.actionIndex - right.actionIndex);
  }

  private async openPartEditor(partIndex: number | null): Promise<void> {
    const sourcePart = partIndex === null
      ? createEmptySongPart()
      : this.sheet().parts[partIndex];

    if (!sourcePart) {
      return;
    }

    const modalRef = this.modalService.show(SongPartEditorComponent, {
      data: {
        sheet: this.sheet(),
        editingPartIndex: partIndex,
        part: cloneSongPart(sourcePart)
      },
      width: '95vw',
      height: '90vh',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: 'modal-xl',
      closeOnBackdropClick: false
    });

    const saved = await modalRef.afterClosed();
    if (saved) {
      this.changed.emit();
    }
  }
}
