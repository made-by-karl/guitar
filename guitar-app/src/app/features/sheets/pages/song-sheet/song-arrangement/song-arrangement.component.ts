import { SongPartTransportComponent } from '@/app/features/sheets/ui/song-part-transport/song-part-transport.component';
import { SongPlayViewComponent } from '@/app/features/sheets/ui/song-play-view/song-play-view.component';
import { SongPlaybackComponent } from '@/app/features/sheets/ui/song-playback/song-playback.component';
import { CommonModule, NgComponentOutlet } from '@angular/common';
import { Component, HostListener, Injector, OnDestroy, ViewChild, afterNextRender, computed, effect, inject, input, output, signal } from '@angular/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { toSignal } from '@angular/core/rxjs-interop';
import { MODAL_DATA, MODAL_REF, ModalRef, ModalService } from '@/app/core/services/modal.service';
import { DialogService } from '@/app/core/services/dialog.service';
import { NotificationService } from '@/app/core/services/notification.service';
import { getOccurrenceNumber, getSongArrangement } from '@/app/features/sheets/services/song-arrangement';
import { SongPart, SongPartOccurrence, SongSheetWithData } from '@/app/features/sheets/services/song-sheets.model';
import { SongSheetsService } from '@/app/features/sheets/services/song-sheets.service';
import { SongPartPlaybackService } from '@/app/features/sheets/services/song-part-playback.service';
import { SongPartEditorComponent, SongPartEditorModalData } from '../song-part-editor/song-part-editor.component';
import { SongSheetChoiceModalComponent } from '../song-sheet-choice-modal.component';
import { cloneSongPart } from '../song-sheet.helpers';

@Component({
  selector: 'app-song-arrangement',
  imports: [SongPartTransportComponent, SongPlaybackComponent, CommonModule, DragDropModule, NgComponentOutlet],
  templateUrl: './song-arrangement.component.html',
  styleUrl: './song-arrangement.component.scss'
})
export class SongArrangementComponent implements OnDestroy {
  readonly sheet = input.required<SongSheetWithData>();
  readonly changed = output<void>();
  private readonly storedSheet = signal<SongSheetWithData | undefined>(undefined);
  readonly currentSheet = computed(() => this.storedSheet() ?? this.sheet());
  readonly occurrences = computed(() => getSongArrangement(this.currentSheet()));
  readonly selectedId = signal<string | undefined>(undefined);
  readonly editingId = signal<string | undefined>(undefined);
  readonly selectedOccurrence = computed(() => this.occurrences().find(item => item.id === this.selectedId()));
  readonly editorInjector = signal<Injector | undefined>(undefined);
  readonly isDragging = signal(false);
  readonly busy = signal(false);
  readonly editorComponent = SongPartEditorComponent;
  @ViewChild(NgComponentOutlet) private outlet?: NgComponentOutlet;

  private readonly service = inject(SongSheetsService);
  private readonly modal = inject(ModalService);
  private readonly dialogs = inject(DialogService);
  private readonly notifications = inject(NotificationService);
  private readonly injector = inject(Injector);
  readonly playback = inject(SongPartPlaybackService);
  readonly playbackState = toSignal(this.playback.state$, { initialValue: this.playback.getSnapshot() });
  readonly canPlay = computed(() => this.playback.canPlaySong(this.currentSheet()));
  readonly songPlaybackLabel = computed(() => this.playbackState().type !== 'song' ? 'Play song'
    : this.playbackState().status === 'preparing' ? 'Preparing…'
    : (this.playbackState().status === 'playing' || this.playbackState().status === 'buffering') ? 'Pause song' : 'Resume song');
  private readonly playableOccurrenceIds = computed(() => new Set(this.occurrences().filter(occurrence => {
    const part = this.part(occurrence);
    return part && this.playback.canPlaySongPart(this.currentSheet(), part, occurrence.id);
  }).map(occurrence => occurrence.id)));
  private refreshTask = Promise.resolve();
  private playView?: ModalRef<void>;
  private destroyed = false;
  readonly enteringPlayView = signal(false);
  readonly playViewOpen = signal(false);

  constructor() {
    effect(() => this.storedSheet.set(this.sheet()));
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.playView?.close();
    this.playback.stopSong();
    this.playback.stopSongPart();
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.editor()?.hasUnsavedChanges()) { event.preventDefault(); event.returnValue = ''; }
  }

  private editor(): SongPartEditorComponent | undefined {
    const instance: unknown = this.outlet?.componentInstance;
    return instance instanceof SongPartEditorComponent ? instance : undefined;
  }

  async confirmNavigation(): Promise<boolean> {
    if (this.busy() || this.editor()?.saving()) return false;
    try {
      const allowed = await this.editor()?.canLeave() ?? true;
      await this.refreshTask;
      return allowed;
    } catch {
      this.notifications.error('Could not save changes. Please try again.');
      return false;
    }
  }

  part(occurrence: SongPartOccurrence): SongPart | undefined {
    return this.currentSheet().parts.find(part => part.id === occurrence.partId);
  }

  number(occurrence: SongPartOccurrence): number { return getOccurrenceNumber(this.occurrences(), occurrence); }

  summary(occurrence: SongPartOccurrence): string {
    const part = this.part(occurrence);
    if (!part) return 'Part is missing';
    return `${part.measures.length} ${part.measures.length === 1 ? 'measure' : 'measures'}`;
  }

  selectOccurrence(id: string): void {
    if (!this.isDragging()) this.selectedId.set(id);
  }

  async editOccurrence(id: string): Promise<void> {
    if (this.editingId() === id) return;
    if (!await this.confirmNavigation()) return;
    const occurrence = this.occurrences().find(item => item.id === id);
    const part = occurrence && this.part(occurrence);
    if (!occurrence || !part) return;
    const data: SongPartEditorModalData = {
      sheet: this.currentSheet(), part: cloneSongPart(part),
      editingPartIndex: this.currentSheet().parts.findIndex(item => item.id === part.id),
      occurrence: { ...occurrence }, occurrenceNumber: this.number(occurrence), embedded: true
    };
    const ref: ModalRef<boolean> = {
      close: saved => {
        if (saved) this.refreshTask = this.refresh();
        else void this.closeEditor();
      },
      afterClosed: async () => false
    };
    this.selectedId.set(id);
    this.editingId.set(id);
    this.editorInjector.set(Injector.create({ parent: this.injector, providers: [
      { provide: MODAL_DATA, useValue: data }, { provide: MODAL_REF, useValue: ref }
    ] }));
  }

  async closeEditor(): Promise<void> {
    if (!await this.confirmNavigation()) return;
    this.editorInjector.set(undefined);
    this.editingId.set(undefined);
  }

  async startWriting(): Promise<void> { await this.addOccurrence(); }

  async chooseSection(afterId?: string | null): Promise<void> {
    if (!await this.confirmNavigation()) return;
    const ref = this.modal.show(SongSheetChoiceModalComponent, {
      data: { title: 'Add to the song', choices: [
        { value: 'new', text: 'New part' },
        ...this.currentSheet().parts.map(part => ({ value: part.id, text: `Use ${part.section || 'Untitled part'} · ${part.measures.length} measures` }))
      ] }, width: '460px', maxWidth: '95vw', closeOnBackdropClick: true
    });
    const choice = await ref.afterClosed();
    if (choice) await this.addOccurrence(choice === 'new' ? undefined : choice, afterId);
  }

  private async addOccurrence(partId?: string, afterId?: string | null): Promise<void> {
    if (!await this.confirmNavigation()) return;
    this.busy.set(true);
    try {
      const occurrence = await this.service.addOccurrence(this.currentSheet().id, partId, afterId);
      await this.refresh();
      this.busy.set(false);
      await this.editOccurrence(occurrence.id);
    } catch {
      this.notifications.error('Could not add this section. Please try again.');
    } finally { this.busy.set(false); }
  }

  async move(from: number, to: number): Promise<void> {
    if (from === to) return;
    if (!await this.confirmNavigation()) return;
    try {
      await this.service.moveOccurrence(this.currentSheet().id, from, to);
      await this.refresh();
    } catch { this.notifications.error('Could not move this section. Please try again.'); }
  }

  async drop(event: CdkDragDrop<SongPartOccurrence[]>): Promise<void> { await this.move(event.previousIndex, event.currentIndex); }

  async remove(occurrence: SongPartOccurrence): Promise<void> {
    const confirmed = await this.dialogs.confirm('Remove this occurrence and its lyrics from the song? Its music stays available in Parts.', 'Remove occurrence', 'Remove', 'Cancel', { variant: 'danger' });
    if (!confirmed) return;
    if (!await this.confirmNavigation()) return;
    try {
      await this.service.removeOccurrence(this.currentSheet().id, occurrence.id);
      if (this.isOccurrencePlaybackActive(occurrence)) this.playback.stopSongPart();
      if (this.editingId() === occurrence.id) { this.editorInjector.set(undefined); this.editingId.set(undefined); }
      if (this.selectedId() === occurrence.id) this.selectedId.set(undefined);
      await this.refresh();
    } catch { this.notifications.error('Could not remove this occurrence. Please try again.'); }
  }

  canPlayOccurrence(occurrence: SongPartOccurrence): boolean {
    return this.playableOccurrenceIds().has(occurrence.id);
  }

  isOccurrencePlaybackActive(occurrence: SongPartOccurrence): boolean {
    const state = this.playbackState();
    return state.type === 'part' && state.occurrenceId === occurrence.id;
  }

  async toggleOccurrence(occurrence: SongPartOccurrence): Promise<void> {
    if (this.isOccurrencePlaybackActive(occurrence)) {
      if (this.playbackState().status === 'paused') this.playback.resumeSongPart();
      else this.playback.pauseSongPart();
      return;
    }
    const current = this.occurrences().find(item => item.id === occurrence.id);
    const part = current && this.part(current);
    if (part) await this.playback.playSongPart(this.currentSheet(), part, occurrence.id, 'song');
  }

  async openPlayView(opener: HTMLElement): Promise<void> {
    if (this.enteringPlayView() || this.playView) return;
    this.enteringPlayView.set(true);
    try {
      if (!await this.confirmNavigation() || this.destroyed) return;
      const state = this.playback.getSnapshot();
      const attached = state.type === 'song' && state.songSnapshot?.id === this.currentSheet().id;
      const sheet = attached ? state.songSnapshot! : JSON.parse(JSON.stringify(this.currentSheet())) as SongSheetWithData;
      if (!attached) this.playback.stop();
      const ref = this.modal.show(SongPlayViewComponent, {
        data: { sheet }, width: '100vw', height: '100dvh', maxWidth: '100vw', maxHeight: '100dvh',
        panelClass: 'modal-fullscreen', closeOnBackdropClick: false
      });
      this.playView = ref;
      this.playViewOpen.set(true);
      await ref.afterClosed();
    } finally {
      this.playView = undefined;
      this.playViewOpen.set(false);
      this.enteringPlayView.set(false);
      if (!this.destroyed) afterNextRender(() => {
        // Entry is re-enabled by this render before it can receive focus.
        if (opener.isConnected) opener.focus({ preventScroll: true });
      }, { injector: this.injector });
    }
  }

  async toggleSong(): Promise<void> {
    const state = this.playbackState();
    if (state.type === 'song') {
      if (state.status === 'paused') this.playback.resumeSong();
      else this.playback.pauseSong();
      return;
    }
    await this.playback.playSong(this.currentSheet());
  }

  private async refresh(): Promise<void> {
    const sheet = await this.service.getByIdWithData(this.currentSheet().id);
    if (sheet) { this.storedSheet.set(sheet); this.editor()?.updateSheet(sheet); }
    this.changed.emit();
  }
}
