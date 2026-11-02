import { CommonModule, NgComponentOutlet } from '@angular/common';
import { Component, HostListener, Injector, OnDestroy, ViewChild, computed, effect, inject, input, output, signal } from '@angular/core';
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
  imports: [CommonModule, DragDropModule, NgComponentOutlet],
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
  readonly editorInjector = signal<Injector | undefined>(undefined);
  readonly menuId = signal<string | undefined>(undefined);
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
  private refreshTask = Promise.resolve();

  constructor() {
    effect(() => this.storedSheet.set(this.sheet()));
  }

  ngOnDestroy(): void { this.playback.stopSong(); }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.editor()?.hasUnsavedChanges()) event.returnValue = '';
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
    const names = part.measures.flatMap(item => (item.measure.actionGrips ?? []).map(grip => grip.name));
    return `${part.measures.length} ${part.measures.length === 1 ? 'measure' : 'measures'}${names.length ? ' · ' + names.slice(0, 5).join(' · ') : ''}`;
  }

  async selectOccurrence(id: string): Promise<void> {
    if (!await this.confirmNavigation()) return;
    const occurrence = this.occurrences().find(item => item.id === id);
    const part = occurrence && this.part(occurrence);
    if (!occurrence || !part) return;
    this.menuId.set(undefined);
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
    this.editorInjector.set(Injector.create({ parent: this.injector, providers: [
      { provide: MODAL_DATA, useValue: data }, { provide: MODAL_REF, useValue: ref }
    ] }));
  }

  async closeEditor(): Promise<void> {
    if (!await this.confirmNavigation()) return;
    this.editorInjector.set(undefined);
    this.selectedId.set(undefined);
  }

  async startWriting(): Promise<void> { await this.addOccurrence(); }

  async chooseSection(): Promise<void> {
    if (!await this.confirmNavigation()) return;
    const ref = this.modal.show(SongSheetChoiceModalComponent, {
      data: { title: 'Add to the song', choices: [
        { value: 'new', text: 'Write new music' },
        ...this.currentSheet().parts.map(part => ({ value: part.id, text: `Use ${part.section || 'Untitled part'} · ${part.measures.length} measures` }))
      ] }, width: '460px', maxWidth: '95vw', closeOnBackdropClick: true
    });
    const choice = await ref.afterClosed();
    if (choice) await this.addOccurrence(choice === 'new' ? undefined : choice);
  }

  private async addOccurrence(partId?: string, afterId?: string): Promise<void> {
    if (!await this.confirmNavigation()) return;
    this.busy.set(true);
    try {
      const occurrence = await this.service.addOccurrence(this.currentSheet().id, partId, afterId);
      await this.refresh();
      this.busy.set(false);
      await this.selectOccurrence(occurrence.id);
    } catch {
      this.notifications.error('Could not add this section. Please try again.');
    } finally { this.busy.set(false); }
  }

  async repeat(occurrence: SongPartOccurrence): Promise<void> { await this.addOccurrence(occurrence.partId, occurrence.id); }

  async move(from: number, to: number): Promise<void> {
    if (!await this.confirmNavigation()) return;
    try {
      await this.service.moveOccurrence(this.currentSheet().id, from, to);
      await this.refresh();
      const selected = this.selectedId();
      if (selected) await this.selectOccurrence(selected);
    } catch { this.notifications.error('Could not move this section. Please try again.'); }
    this.menuId.set(undefined);
  }

  async drop(event: CdkDragDrop<SongPartOccurrence[]>): Promise<void> { await this.move(event.previousIndex, event.currentIndex); }

  async remove(occurrence: SongPartOccurrence): Promise<void> {
    const confirmed = await this.dialogs.confirm('Remove this occurrence and its lyrics from the song? Its music stays available in Parts.', 'Remove occurrence', 'Remove', 'Cancel', { variant: 'danger' });
    if (!confirmed) return;
    if (this.selectedId() !== occurrence.id && !await this.confirmNavigation()) return;
    try {
      await this.service.removeOccurrence(this.currentSheet().id, occurrence.id);
      if (this.selectedId() === occurrence.id) { this.editorInjector.set(undefined); this.selectedId.set(undefined); }
      await this.refresh();
      const selected = this.selectedId();
      if (selected) await this.selectOccurrence(selected);
    } catch { this.notifications.error('Could not remove this occurrence. Please try again.'); }
    this.menuId.set(undefined);
  }

  async toggleSong(): Promise<void> {
    const state = this.playbackState();
    if (state.type === 'song') {
      if (state.status === 'paused') this.playback.resumeSong();
      else this.playback.pauseSong();
      return;
    }
    if (!await this.confirmNavigation()) return;
    await this.playback.playSong(this.currentSheet());
  }

  private async refresh(): Promise<void> {
    const sheet = await this.service.getByIdWithData(this.currentSheet().id);
    if (sheet) this.storedSheet.set(sheet);
    this.changed.emit();
  }
}
