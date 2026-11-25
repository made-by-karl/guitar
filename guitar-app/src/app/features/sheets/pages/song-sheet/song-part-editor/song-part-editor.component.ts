import { MusicClipboardService } from '@/app/core/services/music-clipboard.service';
import { DialogService } from '@/app/core/services/dialog.service';
import { pickClipboardEntry } from '@/app/core/ui/music-clipboard/clipboard-picker';
import { MeasureSelection } from '@/app/core/ui/music-clipboard/measure-selection';
import { MeasureHoldDirective } from '@/app/core/ui/music-clipboard/measure-hold.directive';
import { MeasureSelectionBarComponent } from '@/app/core/ui/music-clipboard/measure-selection-bar.component';
import { SongPartTransportComponent } from '@/app/features/sheets/ui/song-part-transport/song-part-transport.component';
import { PlaybackHighlightDirective } from '@/app/core/ui/playback-highlight/playback-highlight.directive';
import { songPlaybackHighlight } from '@/app/features/sheets/services/song-playback-position';
import { MediaPlaybackControlsComponent } from '@/app/core/ui/media-playback-controls/media-playback-controls.component';
import { CommonModule, NgComponentOutlet } from '@angular/common';
import { afterNextRender, ChangeDetectorRef, Component, computed, ElementRef, HostListener, Inject, Injector, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { MODAL_DATA, MODAL_REF, ModalComponent, ModalDataComponent, ModalRef, ModalService } from '@/app/core/services/modal.service';
import { NotificationService } from '@/app/core/services/notification.service';
import { PlayingPattern } from '@/app/features/patterns/services/playing-patterns.model';
import { PatternLibrarySelectorModalComponent } from '@/app/features/patterns/ui/pattern-library-selector-modal/pattern-library-selector-modal.component';
import { PlayingActionsComponent, PlayingActionsNotationContext, PlayingActionsNotationHistoryEntry } from '@/app/features/patterns/ui/playing-actions/playing-actions.component';
import { SongPatternWorkspaceComponent, SongPatternWorkspaceData } from '../song-pattern-workspace/song-pattern-workspace.component';
import {
  SongPart,
  SongPartOccurrence,
  SongPartMeasure,
  SongSheetPattern,
  SongSheetWithData
} from '@/app/features/sheets/services/song-sheets.model';
import { SongPartPlaybackService, SongSheetPlaybackState } from '@/app/features/sheets/services/song-part-playback.service';
import { SongSheetsService } from '@/app/features/sheets/services/song-sheets.service';
import { Subscription } from 'rxjs';
import {
  buildGripByIdMap,
  cloneSongPart,
  cloneSongSheetPattern,
  createEmptySongSheetPattern,
  createSongSheetEntityId,
  toSongSheetPattern
} from '../song-sheet.helpers';
import { SongSheetChoice, SongSheetChoiceModalComponent, SongSheetChoiceModalData } from '../song-sheet-choice-modal.component';
import { getSongArrangement, getOccurrenceHistory, getOccurrenceNumber } from '@/app/features/sheets/services/song-arrangement';
import { SongPartUnlockModalComponent } from './song-part-unlock-modal.component';
import {
  SongPartMeasureEditorModalComponent,
  SongPartMeasureEditorResult
} from './song-part-measure-editor-modal.component';

type SongPartEditorTab = 'music' | 'lyrics';

export interface SongPartEditorModalData {
  sheet: SongSheetWithData;
  part: SongPart;
  editingPartIndex: number | null;
  occurrence?: SongPartOccurrence;
  occurrenceNumber?: number;
  embedded?: boolean;
  origin?: 'Song' | 'Parts';
}

@Component({
  selector: 'app-song-part-editor',
  standalone: true,
  imports: [MeasureHoldDirective, MeasureSelectionBarComponent, NgComponentOutlet, SongPartTransportComponent, PlaybackHighlightDirective, MediaPlaybackControlsComponent, CommonModule, FormsModule, DragDropModule, PlayingActionsComponent],
  templateUrl: './song-part-editor.component.html',
  styleUrl: './song-part-editor.component.scss'
})
export class SongPartEditorComponent implements
  ModalComponent<boolean>,
  ModalDataComponent<SongPartEditorModalData>,
  OnDestroy {
  get tabs(): ReadonlyArray<{ id: SongPartEditorTab; label: string }> {
    return this.data.occurrence ? [{ id: 'music', label: 'Music' }, { id: 'lyrics', label: 'Lyrics' }] : [{ id: 'music', label: 'Music' }];
  }
  readonly selection = new MeasureSelection<string>();
  private readonly clipboard = inject(MusicClipboardService);
  private readonly dialogs = inject(DialogService);
  readonly activeTab = signal<SongPartEditorTab>('music');
  readonly musicUnlocked = signal(false);
  readonly saving = signal(false);
  readonly childEditorOpen = signal(false);
  readonly childInjector = signal<Injector | undefined>(undefined);
  readonly childComponent = signal<typeof SongPartMeasureEditorModalComponent | typeof SongPatternWorkspaceComponent>(SongPartMeasureEditorModalComponent);
  readonly childLabel = signal('');
  readonly notesOpen = signal(false);
  private readonly injector = inject(Injector);
  @ViewChild(NgComponentOutlet) private childOutlet?: NgComponentOutlet;
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private get scroller(): HTMLElement | null { return this.element.nativeElement.closest('.app-content-container'); }
  readonly workspaceHeight = signal(0);
  private parentScroll = 0;
  private parentFocus: Element | null = null;
  private deciding = false;
  private isNewPart = true;
  get origin(): string { return this.data.origin ?? (this.data.occurrence ? 'Song' : 'Parts'); }
  get partLabel(): string { return (this.tempPart().section || 'Untitled part') + (this.data.occurrenceNumber ? ` (${this.data.occurrenceNumber})` : ''); }
  private child(): SongPartMeasureEditorModalComponent | SongPatternWorkspaceComponent | undefined {
    const child: unknown = this.childOutlet?.componentInstance;
    return child instanceof SongPartMeasureEditorModalComponent || child instanceof SongPatternWorkspaceComponent ? child : undefined;
  }

  readonly saveError = signal('');
  readonly tempLyrics;
  private savedPart = '';
  private savedLyrics = '';
  readonly isDraggingMeasure = signal(false);
  readonly selectedMeasureIndex = signal<number | null>(null);
  readonly sheet;
  readonly tempPart;
  readonly editingPartIndex;
  playbackState = { type: 'none', status: 'idle' } as SongSheetPlaybackState;

  private readonly playbackStateSubscription: Subscription;
  private readonly changeDetector = inject(ChangeDetectorRef);

  constructor(
    @Inject(MODAL_REF) public modalRef: ModalRef<boolean>,
    @Inject(MODAL_DATA) public data: SongPartEditorModalData,
    private readonly songSheetService: SongSheetsService,
    private readonly songPartPlayback: SongPartPlaybackService,
    private readonly modalService: ModalService,
    private readonly notificationService: NotificationService
  ) {
    this.sheet = signal<SongSheetWithData>(this.data.sheet);
    this.tempPart = signal<SongPart>(cloneSongPart(this.data.part));
    this.tempLyrics = signal(this.data.occurrence?.lyrics ?? this.data.part.lyrics ?? '');
    this.rememberSavedState();
    this.editingPartIndex = this.data.editingPartIndex;
    this.playbackState = this.songPartPlayback.getSnapshot();
    this.playbackStateSubscription = this.songPartPlayback.state$.subscribe(state => {
      this.playbackState = state;
    });
  }

  get activeSaveLabel(): string {
    if (this.childEditorOpen()) return this.childComponent() === SongPartMeasureEditorModalComponent ? 'Apply to part' : 'Save Pattern';
    return this.data.embedded ? 'Save changes' : 'Save and close';
  }

  get activeSaveTitle(): string {
    if (this.activeError()) return this.activeError();
    return this.childEditorOpen() && this.childComponent() === SongPartMeasureEditorModalComponent
      ? 'Apply this measure to the part draft; save the part to persist it'
      : this.activeSaveLabel;
  }

  activeError(): string {
    const child = this.childEditorOpen() ? this.child() : undefined;
    return child instanceof SongPatternWorkspaceComponent ? child.error() : this.childEditorOpen() ? '' : this.saveError();
  }

  activeSaving(): boolean {
    const child = this.childEditorOpen() ? this.child() : undefined;
    return this.saving() || (child instanceof SongPatternWorkspaceComponent && child.saving());
  }

  async saveActive(): Promise<void> {
    if (this.activeSaving()) return;
    const child = this.childEditorOpen() ? this.child() : undefined;
    if (child) await child.save();
    else if (!this.childEditorOpen()) await this.save();
  }

  updateSheet(sheet: SongSheetWithData): void {
    this.sheet.set(sheet);
    if (this.data.occurrence) this.data.occurrenceNumber = getOccurrenceNumber(getSongArrangement(sheet), this.data.occurrence);
  }

  readonly musicLocked = computed(() => !this.musicUnlocked() &&
    getSongArrangement(this.sheet()).filter(occurrence => occurrence.partId === this.tempPart().id).length > 1);

  hasPartChanges(): boolean {
    return (!this.data.occurrence && this.editingPartIndex === null && this.isNewPart)
      || JSON.stringify(this.tempPart()) !== this.savedPart || this.tempLyrics() !== this.savedLyrics;
  }

  hasUnsavedChanges(): boolean {
    return (this.childEditorOpen() && !!this.child()?.hasUnsavedChanges()) || this.hasPartChanges();
  }

  async returnToPart(): Promise<boolean> {
    if (this.saving()) return false;
    const child = this.child();
    if (child && !await child.canLeave()) return false;
    // Apply/Save may already have returned to the parent.
    if (this.childEditorOpen() || this.notesOpen()) this.finishChild();
    this.notesOpen.set(false);
    return true;
  }

  async canLeave(): Promise<boolean> {
    if (this.saving() || this.deciding) return false;
    this.deciding = true;
    try {
      if (!this.notesOpen() && !await this.returnToPart()) return false;
      if (!this.hasUnsavedChanges()) return true;
      const choice = await this.openChoiceDialog({ title: 'Keep your changes?', choices: [
        { value: 'save', text: 'Save and continue' },
        { value: 'discard', text: 'Discard changes' },
        { value: 'stay', text: 'Keep editing' }
      ] });
      if (choice === 'save') return await this.save();
      // The navigation owner discards by unmounting. Presentation-only actions
      // (such as Play view) keep the current draft when returning to the editor.
      return choice === 'discard';
    } finally { this.deciding = false; }
  }

  async unlockMusic(): Promise<void> {
    const count = getSongArrangement(this.sheet()).filter(occurrence => occurrence.partId === this.tempPart().id).length;
    const ref = this.modalService.show(SongPartUnlockModalComponent, {
      data: { count, canMakeIndependent: !!this.data.occurrence }, width: '460px', maxWidth: '95vw', closeOnBackdropClick: false
    });
    const choice = await ref.afterClosed();
    if (choice === 'unlock') this.musicUnlocked.set(true);
    if (choice === 'independent' && this.data.occurrence) {
      const copy = cloneSongPart(this.tempPart());
      copy.id = createSongSheetEntityId('sp');
      copy.measures = copy.measures.map(measure => ({ ...measure, id: createSongSheetEntityId('spm') }));
      this.tempPart.set(copy);
      this.data.occurrenceNumber = 1;
      this.musicUnlocked.set(true);
    }
  }

  editNotes(): void {
    this.captureParent();
    this.notesOpen.set(true);
    this.revealWorkspace();
  }

  private captureParent(): void {
    this.parentScroll = this.scroller?.scrollTop ?? window.scrollY;
    this.parentFocus = document.activeElement;
    this.sizeWorkspace();
  }

  @HostListener('window:resize')
  sizeWorkspace(): void {
    const scroller = this.scroller;
    if (scroller) this.workspaceHeight.set(Math.max(0, scroller.clientHeight - 44 - 12));
  }

  private revealWorkspace(): void {
    afterNextRender(() => {
      const workspace = this.element.nativeElement.querySelector<HTMLElement>('.part-editor-modal');
      const scroller = this.scroller;
      if (workspace && scroller) scroller.scrollTop += workspace.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 44;
      const focusTarget = this.notesOpen() ? '.notes-workspace textarea' : '.workspace-path .path-current';
      this.element.nativeElement.querySelector<HTMLElement>(focusTarget)?.focus({ preventScroll: true });
    }, { injector: this.injector });
  }

  private finishChild(): void {
    this.childEditorOpen.set(false);
    this.childInjector.set(undefined);
    this.notesOpen.set(false);
    this.changeDetector.detectChanges();
    if (this.scroller) this.scroller.scrollTop = this.parentScroll;
    else window.scrollTo({ top: this.parentScroll });
    if (this.parentFocus instanceof HTMLElement && this.parentFocus.isConnected) this.parentFocus.focus({ preventScroll: true });
  }

  closeNotes(): void { this.finishChild(); }

  private rememberSavedState(): void {
    this.savedPart = JSON.stringify(this.tempPart());
    this.savedLyrics = this.tempLyrics();
  }

  readonly canPlayPart = computed(() => this.songPartPlayback.canPlaySongPart(this.sheet(), this.tempPart(), this.data.occurrence?.id));
  readonly canPlaySelectedMeasure = computed(() => {
    const measure = this.getSelectedMeasure();
    return !!measure && this.songPartPlayback.canPlayMeasure(this.sheet(), this.tempPart(), measure.id, this.data.occurrence?.id);
  });

  ngOnDestroy(): void {
    this.playbackStateSubscription.unsubscribe();
    if (this.playbackState.source === 'editor') {
      this.songPartPlayback.stopMeasurePreview();
      this.songPartPlayback.stopSongPart();
    }
  }

  onTabKeydown(event: KeyboardEvent, tabIndex: number): void {
    let nextIndex: number;
    switch (event.key) {
      case 'ArrowRight': nextIndex = (tabIndex + 1) % this.tabs.length; break;
      case 'ArrowLeft': nextIndex = (tabIndex + this.tabs.length - 1) % this.tabs.length; break;
      case 'Home': nextIndex = 0; break;
      case 'End': nextIndex = this.tabs.length - 1; break;
      default: return;
    }

    event.preventDefault();
    this.activeTab.set(this.tabs[nextIndex].id);
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
    }
  }

  updateSectionName(section: string): void {
    if (this.musicLocked()) return;
    this.tempPart.update(part => ({
      ...part,
      section
    }));
  }

  updateLyrics(lyrics: string): void {
    this.tempLyrics.set(lyrics);
  }

  updateNotes(notes: string): void {
    if (this.musicLocked()) return;
    this.tempPart.update(part => ({
      ...part,
      notes
    }));
  }

  removeMeasure(measureIndex: number): void {
    if (this.musicLocked()) return;
    const measureCount = this.tempPart().measures.length;
    this.tempPart.update(part => ({
      ...part,
      measures: part.measures.filter((_, index) => index !== measureIndex)
    }));
    this.selectNearestMeasureAfterRemoval(measureIndex, measureCount);
  }

  startMeasureSelection(measureId: string): void {
    this.selectedMeasureIndex.set(null);
    this.selection.start(measureId);
    afterNextRender(() => this.element.nativeElement.querySelector<HTMLElement>('.measure-row[aria-pressed="true"]')?.focus({ preventScroll: true }), { injector: this.injector });
  }

  exitMeasureSelection(): void {
    this.selection.clear();
    afterNextRender(() => this.element.nativeElement.querySelector<HTMLElement>('[data-measure-select-start], .empty-part-state button')?.focus({ preventScroll: true }), { injector: this.injector });
  }

  copyMeasure(measureIndex: number): void { this.copyMeasures([measureIndex]); }

  copySelectedMeasures(): void {
    const indices = this.tempPart().measures.flatMap((measure, index) => this.selection.selected().has(measure.id) ? [index] : []);
    if (this.copyMeasures(indices)) this.exitMeasureSelection();
  }

  private copyMeasures(indices: number[]): boolean {
    if (!indices.length) return false;
    try {
      this.clipboard.copyMeasures(indices.map(index => this.tempPart().measures[index].measure),
        `${this.sheet().name} · ${this.tempPart().section} · Measures ${indices.map(i => i + 1).join(', ')}`);
      this.notificationService.success(indices.length === 1 ? `Copied measure ${indices[0] + 1}` : `Copied ${indices.length} measures`);
      return true;
    } catch (error) { this.notificationService.error((error as Error).message); return false; }
  }

  async pasteMeasures(insertionIndex: number): Promise<void> {
    if (this.musicLocked() || this.selection.active()) return;
    const id = await pickClipboardEntry(this.modalService, 'measures');
    const measures = id === undefined ? undefined : this.clipboard.read(id, 'measures');
    if (!measures || this.musicLocked() || this.selection.active()) return;
    this.insertMeasures(insertionIndex, measures.map(measure => ({ id: createSongSheetEntityId('spm'), measure })));
  }

  async deleteSelectedMeasures(): Promise<void> {
    if (this.musicLocked()) return;
    const selected = this.selection.selected();
    if (!selected.size || !await this.dialogs.confirm(`Delete ${selected.size} selected measures?`, 'Delete measures', 'Delete', 'Cancel', { variant: 'danger' }) || this.musicLocked()) return;
    this.tempPart.update(part => ({ ...part, measures: part.measures.filter(measure => !selected.has(measure.id)) }));
    this.selectedMeasureIndex.set(null);
    this.exitMeasureSelection();
  }

  async editMeasure(measureIndex: number, newMeasure?: SongPartMeasure): Promise<void> {
    if (this.musicLocked() || this.childEditorOpen()) return;
    const part = this.tempPart();
    const partMeasure = newMeasure ?? part.measures[measureIndex];
    if (!partMeasure) return;
    this.captureParent();
    const label = `Measure ${measureIndex + 1}`;
    const ref: ModalRef<SongPartMeasureEditorResult | undefined> = {
      close: result => {
        if (result) {
          const updated = { ...partMeasure, measure: { ...result.measure, actionGrips: result.actionGrips.map(grip => ({ ...grip, measureIndex: 0 })) } };
          if (newMeasure) this.insertMeasures(measureIndex, [updated]);
          else this.tempPart.update(part => ({ ...part, measures: part.measures.map(item => item.id === partMeasure.id ? updated : item) }));
        }
        this.finishChild();
        void this.refreshSheet().catch(() => this.notificationService.error('Could not refresh sheet data. Your draft is still here.'));
      }, afterClosed: async () => undefined
    };
    this.childLabel.set(label);
    this.childComponent.set(SongPartMeasureEditorModalComponent);
    this.childInjector.set(Injector.create({ parent: this.injector, providers: [
      { provide: MODAL_REF, useValue: ref },
      { provide: MODAL_DATA, useValue: {
        sheet: this.sheet(), part: newMeasure ? { ...part, measures: [...part.measures.slice(0, measureIndex), newMeasure, ...part.measures.slice(measureIndex)] } : part,
        measureId: partMeasure.id, occurrenceId: this.data.occurrence?.id,
        measure: partMeasure.measure, actionGrips: partMeasure.measure.actionGrips ?? [], measureLabel: label,
        notationHistory: this.getPartMeasureNotationHistory(measureIndex), embedded: true
      } }
    ] }));
    this.childEditorOpen.set(true);
    this.revealWorkspace();
  }

  startMeasureDrag(): void {
    this.isDraggingMeasure.set(true);
    // Render collapsed rows before CDK measures the drop targets.
    this.changeDetector.detectChanges();
  }

  dropMeasure(event: CdkDragDrop<SongPartMeasure[]>): void {
    if (this.musicLocked() || this.selection.active()) return;
    this.isDraggingMeasure.set(false);
    const part = this.tempPart();
    if (event.previousIndex === event.currentIndex) {
      this.ensureSelectedMeasure();
      return;
    }

    const selectedMeasureId = this.getSelectedMeasure()?.id;
    const nextMeasures = [...part.measures];
    moveItemInArray(nextMeasures, event.previousIndex, event.currentIndex);
    this.tempPart.set({
      ...part,
      measures: nextMeasures
    });
    this.selectMeasureById(selectedMeasureId);
  }

  selectMeasure(measureIndex: number): void {
    if (this.selection.active()) {
      const measure = this.tempPart().measures[measureIndex];
      if (measure) this.selection.toggle(measure.id);
      return;
    }
    if (!this.tempPart().measures[measureIndex]) {
      this.ensureSelectedMeasure();
      return;
    }

    this.selectedMeasureIndex.update(selectedIndex => selectedIndex === measureIndex ? null : measureIndex);
  }

  clearMeasureSelection(): void {
    this.selectedMeasureIndex.set(null);
  }

  getSelectedMeasure(): SongPartMeasure | undefined {
    const selectedIndex = this.selectedMeasureIndex();
    if (selectedIndex === null) {
      return undefined;
    }

    return this.tempPart().measures[selectedIndex];
  }

  getSelectedMeasureLabel(): string {
    const selectedIndex = this.selectedMeasureIndex();
    return selectedIndex === null ? '' : `Measure ${selectedIndex + 1}`;
  }

  async toggleSelectedMeasurePlayback(part: SongPart): Promise<void> {
    const measure = this.getSelectedMeasure();
    if (!measure) {
      return;
    }

    await this.toggleMeasurePlayback(part, measure);
  }

  async editSelectedMeasure(): Promise<void> {
    const selectedIndex = this.selectedMeasureIndex();
    if (selectedIndex === null) {
      return;
    }

    await this.editMeasure(selectedIndex);
  }

  copySelectedMeasure(): void {
    const selectedIndex = this.selectedMeasureIndex();
    if (selectedIndex === null) {
      return;
    }

    this.copyMeasure(selectedIndex);
  }

  removeSelectedMeasure(): void {
    const selectedIndex = this.selectedMeasureIndex();
    if (selectedIndex === null) {
      return;
    }

    this.removeMeasure(selectedIndex);
  }

  getMeasurePlaybackPosition(measure: SongPartMeasure) {
    return songPlaybackHighlight(this.playbackState, { source: 'editor', partId: this.tempPart().id,
      occurrenceId: this.data.occurrence?.id, measureId: measure.id });
  }

  getMeasurePreview(measure: SongPartMeasure): SongPartMeasure {
    const state = this.playbackState;
    return state.source === 'editor' && state.partId === this.tempPart().id && state.occurrenceId === this.data.occurrence?.id
      ? state.presentation?.part.measures.find(item => item.id === measure.id) ?? measure : measure;
  }

  getPartMeasureNotationHistory(measureIndex: number): PlayingActionsNotationHistoryEntry[] {
    const measure = this.tempPart().measures[measureIndex];
    if (measure && this.getMeasurePlaybackPosition(measure)) {
      return (this.playbackState.presentation?.precedingMeasures ?? []).map(measure => ({
        measure, context: { timeSignature: measure.timeSignature, actionGrips: measure.actionGrips,
          gripById: buildGripByIdMap(this.sheet()) }
      }));
    }
    const history = this.data.occurrence ? getOccurrenceHistory(this.sheet(), this.data.occurrence.id, this.tempPart()).flatMap(part => part.measures) : [];
    return [...history, ...this.tempPart().measures.slice(0, measureIndex).map(measure => this.getMeasurePreview(measure))].map(partMeasure => ({
      measure: partMeasure.measure,
      context: this.getPartMeasureNotationContext(partMeasure)
    }));
  }

  getPartMeasureNotationContext(
    partMeasure: SongPartMeasure
  ): PlayingActionsNotationContext {
    return {
      timeSignature: partMeasure.measure.timeSignature,
      actionGrips: (partMeasure.measure.actionGrips ?? []).map(grip => ({ ...grip })),
      gripById: buildGripByIdMap(this.sheet())
    };
  }

  isMeasurePlaybackActive(measure: SongPartMeasure): boolean {
    return this.playbackState.type === 'measure' &&
      this.playbackState.status === 'playing' &&
      this.playbackState.measureId === measure.id && this.playbackState.occurrenceId === this.data.occurrence?.id;
  }

  async addContent(insertionIndex: number): Promise<void> {
    if (this.musicLocked()) return;
    const choices: SongSheetChoice[] = [
      { value: 'new-measure', text: 'New measure' },
      { value: 'paste-measures', text: 'Paste measures…' }
    ];
    if (this.sheet().patterns.length > 0) {
      choices.push({ value: 'from-sheet', text: 'Use existing sheet pattern' });
    }
    choices.push(
      { value: 'from-library', text: 'Import pattern from library' },
      { value: 'create-new', text: 'Create new pattern' }
    );

    const source = await this.openChoiceDialog({
      title: insertionIndex === 0 ? 'Add to Song Part' : `Add after Measure ${insertionIndex}`,
      choices
    });

    if (source === 'paste-measures') { await this.pasteMeasures(insertionIndex); return; }
    if (this.musicLocked() || this.selection.active()) return;

    if (source === 'new-measure') {
      const timeSignature = this.tempPart().measures[insertionIndex - 1]?.measure.timeSignature ?? '4/4';
      await this.editMeasure(insertionIndex, this.songSheetService.createEmptyPartMeasure(timeSignature));
      return;
    }

    let patterns: SongSheetPattern[] = [];
    if (source === 'from-sheet') {
      const selectedPattern = await this.selectSheetPattern();
      patterns = selectedPattern ? [selectedPattern] : [];
    } else if (source === 'from-library') {
      patterns = await this.importPatternsFromLibrary();
    } else if (source === 'create-new') {
      this.openPatternWorkspace(insertionIndex);
      return;
    }

    this.insertMeasures(insertionIndex, patterns.flatMap(pattern => this.songSheetService.createMeasuresFromPattern(pattern)));
  }

  async toggleMeasurePlayback(part: SongPart, measure: SongPartMeasure): Promise<void> {
    await this.songPartPlayback.toggleMeasurePreview(this.sheet(), part, measure.id, this.data.occurrence?.id);
  }

  async playPart(part: SongPart): Promise<void> {
    await this.songPartPlayback.playSongPart(this.sheet(), part, this.data.occurrence?.id, 'editor');
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

  cancel(): void {
    this.modalRef.close(undefined);
  }

  async save(): Promise<boolean> {
    if (this.saving() || this.childEditorOpen()) return false;
    const part = this.tempPart();
    const cleanPart = cloneSongPart({
      ...part,
      section: part.section.trim() || 'Untitled part',
      notes: part.notes.trim()
    });
    this.saving.set(true);
    this.saveError.set('');
    try {
      if (this.data.occurrence) {
        await this.songSheetService.saveOccurrence(this.sheet().id, this.data.occurrence.id, this.tempLyrics(), this.musicLocked() ? undefined : cleanPart);
        this.data.occurrence = { ...this.data.occurrence, partId: cleanPart.id, lyrics: this.tempLyrics() };
      } else if (this.editingPartIndex === null && this.isNewPart) {
        await this.songSheetService.addPart(this.sheet().id, cleanPart);
      } else if (!this.musicLocked()) {
        const latest = await this.songSheetService.getByIdWithData(this.sheet().id);
        const partIndex = latest?.parts.findIndex(item => item.id === cleanPart.id) ?? -1;
        if (partIndex < 0) throw new Error('Part is no longer available');
        await this.songSheetService.updatePart(this.sheet().id, partIndex, cleanPart);
      }
      this.tempPart.set(cleanPart);
      await this.refreshSheet();
      this.musicUnlocked.set(false);
      this.isNewPart = false;
      this.rememberSavedState();
      this.modalRef.close(true);
      return true;
    } catch {
      this.saveError.set('Could not save. Your changes are still here. Try again.');
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  private insertMeasures(insertionIndex: number, measures: SongPartMeasure[]): void {
    if (measures.length === 0) {
      return;
    }

    this.tempPart.update(part => ({
      ...part,
      measures: [
        ...part.measures.slice(0, insertionIndex),
        ...measures,
        ...part.measures.slice(insertionIndex)
      ]
    }));
    this.selectFirstAddedMeasure(insertionIndex);
  }

  private selectNearestMeasureAfterRemoval(removedIndex: number, previousMeasureCount: number): void {
    const nextMeasureCount = Math.max(previousMeasureCount - 1, 0);
    if (nextMeasureCount === 0) {
      this.selectedMeasureIndex.set(null);
      return;
    }

    const selectedIndex = this.selectedMeasureIndex();
    if (selectedIndex === null) {
      return;
    }

    if (selectedIndex === removedIndex) {
      this.selectedMeasureIndex.set(Math.min(removedIndex, nextMeasureCount - 1));
      return;
    }

    if (selectedIndex > removedIndex) {
      this.selectedMeasureIndex.set(selectedIndex - 1);
      return;
    }

    this.ensureSelectedMeasure();
  }

  private selectMeasureById(measureId: string | undefined): void {
    if (!measureId) {
      this.ensureSelectedMeasure();
      return;
    }

    const nextSelectedIndex = this.tempPart().measures.findIndex(measure => measure.id === measureId);
    if (nextSelectedIndex === -1) {
      this.ensureSelectedMeasure();
      return;
    }

    this.selectedMeasureIndex.set(nextSelectedIndex);
  }

  private ensureSelectedMeasure(): void {
    const measureCount = this.tempPart().measures.length;
    if (measureCount === 0) {
      this.selectedMeasureIndex.set(null);
      return;
    }

    const selectedIndex = this.selectedMeasureIndex();
    if (selectedIndex !== null && (selectedIndex < 0 || selectedIndex >= measureCount)) {
      this.selectedMeasureIndex.set(null);
    }
  }

  private selectFirstAddedMeasure(firstAddedMeasureIndex: number): void {
    if (this.tempPart().measures[firstAddedMeasureIndex]) {
      this.selectedMeasureIndex.set(firstAddedMeasureIndex);
      return;
    }

    this.ensureSelectedMeasure();
  }

  private async refreshSheet(): Promise<void> {
    const sheet = await this.songSheetService.getByIdWithData(this.sheet().id);
    if (sheet) {
      this.sheet.set(sheet);
    }
  }

  private async selectSheetPattern(): Promise<SongSheetPattern | undefined> {
    if (this.sheet().patterns.length === 0) {
      return undefined;
    }

    const choice = await this.openChoiceDialog({
      title: 'Choose Sheet Pattern',
      choices: this.sheet().patterns.map(pattern => ({
        value: pattern.id,
        text: pattern.name || 'Untitled Pattern'
      }))
    });

    if (!choice) {
      return undefined;
    }

    return this.sheet().patterns.find(pattern => pattern.id === choice);
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
      data: { selectionMode: 'single' },
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
    await this.refreshSheet();
    return importedPatterns;
  }

  private openPatternWorkspace(insertionIndex: number): void {
    this.captureParent();
    const data: SongPatternWorkspaceData = {
      sheet: this.sheet(), pattern: createEmptySongSheetPattern(), create: true,
      save: async pattern => {
        await this.songSheetService.addPattern(cloneSongSheetPattern(pattern), this.sheet().id);
        await this.refreshSheet();
      }
    };
    const ref: ModalRef<SongSheetPattern | undefined> = {
      close: pattern => {
        if (pattern) this.insertMeasures(insertionIndex, this.songSheetService.createMeasuresFromPattern(pattern));
        this.finishChild();
      }, afterClosed: async () => undefined
    };
    this.childLabel.set('New pattern');
    this.childComponent.set(SongPatternWorkspaceComponent);
    this.childInjector.set(Injector.create({ parent: this.injector, providers: [
      { provide: MODAL_DATA, useValue: data }, { provide: MODAL_REF, useValue: ref }
    ] }));
    this.childEditorOpen.set(true);
    this.revealWorkspace();
  }
}
