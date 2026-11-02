import { Component, OnDestroy, computed, inject, input, output } from '@angular/core';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { DialogService } from '@/app/core/services/dialog.service';
import { ModalService } from '@/app/core/services/modal.service';
import { NotificationService } from '@/app/core/services/notification.service';
import { Measure, PlayingPatternActionGrip } from '@/app/features/patterns/services/playing-patterns.model';
import { PlayingActionsComponent, PlayingActionsNotationContext } from '@/app/features/patterns/ui/playing-actions/playing-actions.component';
import { ResolvedSongPartMeasure, SongPart, SongSheetWithData } from '@/app/features/sheets/services/song-sheets.model';
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
import { getSongArrangement } from '@/app/features/sheets/services/song-arrangement';

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
  private readonly notificationService = inject(NotificationService);
  private readonly songPartPlayback = inject(SongPartPlaybackService);
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
    const copy = await this.songSheetService.duplicatePart(this.sheet().id, partIndex);
    this.notificationService.success(`Copied part "${copy.section}"`);
    this.changed.emit();
  }

  async removePart(partIndex: number): Promise<void> {
    const part = this.sheet().parts[partIndex];
    const count = getSongArrangement(this.sheet()).filter(occurrence => occurrence.partId === part?.id).length;
    const confirmed = await this.dialogService.confirm(
      `Remove this musical part?${count ? ` Its ${count} ${count === 1 ? 'occurrence' : 'occurrences'} and lyrics will also be removed from the song.` : ''}`,
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

  private readonly playablePartIds = computed(() => new Set(
    this.sheet().parts.filter(part => this.songPartPlayback.canPlaySongPart(this.sheet(), part)).map(part => part.id)
  ));

  canPlayPart(part: SongPart): boolean {
    return this.playablePartIds().has(part.id);
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

  getPartMeasures(part: SongPart): ResolvedSongPartMeasure[] {
    return this.songSheetService.resolvePartMeasures(this.sheet(), part);
  }

  getNotationMeasures(measures: ResolvedSongPartMeasure[]): Measure[] {
    return measures.map(measure => measure.measure);
  }

  getNotationContexts(measures: ResolvedSongPartMeasure[]): PlayingActionsNotationContext[] {
    return measures.map(measure => this.getMeasureNotationContext(measure));
  }

  getMeasureNotationContext(measure: ResolvedSongPartMeasure): PlayingActionsNotationContext {
    return {
      timeSignature: measure.measure.timeSignature,
      actionGrips: this.getEffectiveActionGrips(measure),
      gripById: buildGripByIdMap(this.sheet())
    };
  }

  hasPartNotes(part: SongPart): boolean {
    return part.notes.trim().length > 0;
  }

  hasPartLyrics(part: SongPart): boolean {
    return (part.lyrics ?? '').trim().length > 0;
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
    return (measure.measure.actionGrips ?? [])
      .map(actionGrip => ({ ...actionGrip }))
      .sort((left, right) => left.actionIndex - right.actionIndex);
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
