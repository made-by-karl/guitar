import { NgComponentOutlet } from '@angular/common';
import { MODAL_DATA, MODAL_REF, ModalRef } from '@/app/core/services/modal.service';
import { SongPartTransportComponent } from '@/app/features/sheets/ui/song-part-transport/song-part-transport.component';
import { SongPlaybackComponent } from '@/app/features/sheets/ui/song-playback/song-playback.component';
import { Component, HostListener, Injector, OnDestroy, ViewChild, computed, effect, inject, input, output, signal } from '@angular/core';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { DialogService } from '@/app/core/services/dialog.service';
import { NotificationService } from '@/app/core/services/notification.service';
import { SongPart, SongSheetWithData } from '@/app/features/sheets/services/song-sheets.model';
import { SongPartPlaybackService, SongSheetPlaybackState } from '@/app/features/sheets/services/song-part-playback.service';
import { SongSheetsService } from '@/app/features/sheets/services/song-sheets.service';
import { Subscription } from 'rxjs';
import { cloneSongPart, createEmptySongPart } from '../song-sheet.helpers';
import { SongPartEditorComponent } from '../song-part-editor/song-part-editor.component';
import { getSongArrangement } from '@/app/features/sheets/services/song-arrangement';

@Component({
  selector: 'app-song-sheet-parts-tab',
  standalone: true,
  imports: [NgComponentOutlet, SongPartTransportComponent, DragDropModule, SongPlaybackComponent],
  templateUrl: './song-parts-tab.component.html',
  styleUrl: './song-parts-tab.component.scss'
})
export class SongPartsTabComponent implements OnDestroy {
  readonly sheet = input.required<SongSheetWithData>();
  readonly changed = output<void>();
  readonly selectedId = signal<string | undefined>(undefined);
  readonly editingId = signal<string | undefined>(undefined);
  readonly isDragging = signal(false);
  readonly selectedPart = computed(() => this.sheet().parts.find(part => part.id === this.selectedId()));
  readonly editorInjector = signal<Injector | undefined>(undefined);
  readonly editorComponent = SongPartEditorComponent;
  private readonly injector = inject(Injector);
  @ViewChild(NgComponentOutlet) private outlet?: NgComponentOutlet;

  private editor(): SongPartEditorComponent | undefined {
    const instance: unknown = this.outlet?.componentInstance;
    return instance instanceof SongPartEditorComponent ? instance : undefined;
  }

  async confirmNavigation(): Promise<boolean> { return await this.editor()?.canLeave() ?? true; }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.editor()?.hasUnsavedChanges()) { event.preventDefault(); event.returnValue = ''; }
  }

  async closeEditor(): Promise<void> {
    if (!await this.confirmNavigation()) return;
    this.editorInjector.set(undefined);
    this.editingId.set(undefined);
  }

  selectPart(id: string): void { if (!this.isDragging()) this.selectedId.set(id); }
  selectedIndex(): number { return this.sheet().parts.findIndex(part => part.id === this.selectedId()); }


  private readonly songSheetService = inject(SongSheetsService);
  private readonly dialogService = inject(DialogService);
  private readonly notificationService = inject(NotificationService);
  private readonly songPartPlayback = inject(SongPartPlaybackService);
  playbackState = { type: 'none', status: 'idle' } as SongSheetPlaybackState;
  private readonly playbackStateSubscription: Subscription;

  constructor() {
    effect(() => {
      const sheet = this.sheet();
      this.editor()?.updateSheet(sheet);
    });
    this.playbackState = this.songPartPlayback.getSnapshot();
    this.playbackStateSubscription = this.songPartPlayback.state$.subscribe(state => {
      this.playbackState = state;
    });
  }

  ngOnDestroy(): void {
    this.playbackStateSubscription.unsubscribe();
    this.songPartPlayback.stopSongPart();
  }

  async addPart(): Promise<void> {
    await this.openPartEditor(null);
  }

  async editPart(partIndex: number): Promise<void> {
    await this.openPartEditor(partIndex);
  }

  async copyPart(partIndex: number): Promise<void> {
    if (!await this.confirmNavigation()) return;
    const copy = await this.songSheetService.duplicatePart(this.sheet().id, partIndex);
    this.notificationService.success(`Copied part "${copy.section}"`);
    this.changed.emit();
  }

  async removePart(partIndex: number): Promise<void> {
    if (!await this.confirmNavigation()) return;
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
    if (this.playbackState.partId === part.id) this.stopPart();
    if (this.editingId() === part.id) { this.editorInjector.set(undefined); this.editingId.set(undefined); }
    if (this.selectedId() === part.id) this.selectedId.set(undefined);
    this.changed.emit();
  }

  async dropPart(event: CdkDragDrop<SongPart[]>): Promise<void> {
    if (event.previousIndex === event.currentIndex) {
      return;
    }

    if (!await this.confirmNavigation()) return;
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

  hasPartNotes(part: SongPart): boolean {
    return part.notes.trim().length > 0;
  }

  hasPartLyrics(part: SongPart): boolean {
    return (part.lyrics ?? '').trim().length > 0;
  }

  private async openPartEditor(partIndex: number | null): Promise<void> {
    const sourcePart = partIndex === null
      ? createEmptySongPart()
      : this.sheet().parts[partIndex];

    if (!sourcePart) {
      return;
    }

    if (sourcePart.id === this.editingId()) return;
    if (!await this.confirmNavigation()) return;
    const ref: ModalRef<boolean> = {
      close: saved => {
        if (saved) this.changed.emit();
        else void this.closeEditor();
      }, afterClosed: async () => false
    };
    this.selectedId.set(sourcePart.id);
    this.editingId.set(sourcePart.id);
    this.editorInjector.set(Injector.create({ parent: this.injector, providers: [
      { provide: MODAL_DATA, useValue: { sheet: this.sheet(), editingPartIndex: partIndex, part: cloneSongPart(sourcePart), embedded: true, origin: 'Parts' } },
      { provide: MODAL_REF, useValue: ref }
    ] }));
  }
}
