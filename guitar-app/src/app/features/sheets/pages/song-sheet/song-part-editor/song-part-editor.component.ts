import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, computed, Inject, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { MODAL_DATA, MODAL_REF, ModalComponent, ModalDataComponent, ModalRef, ModalService } from '@/app/core/services/modal.service';
import { NotificationService } from '@/app/core/services/notification.service';
import { PlayingPattern } from '@/app/features/patterns/services/playing-patterns.model';
import { PatternLibrarySelectorModalComponent } from '@/app/features/patterns/ui/pattern-library-selector-modal/pattern-library-selector-modal.component';
import { PlayingActionsComponent, PlayingActionsNotationContext, PlayingActionsNotationHistoryEntry } from '@/app/features/patterns/ui/playing-actions/playing-actions.component';
import { PlayingPatternEditorModalComponent } from '@/app/features/patterns/ui/playing-pattern-editor-modal/playing-pattern-editor-modal.component';
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
  canForwardPart,
  canRewindPart,
  cloneSongPart,
  cloneSongPartMeasure,
  cloneSongSheetPattern,
  createEmptySongSheetPattern,
  createSongSheetEntityId,
  getPartMeasureCounter,
  isPartPlaybackActive,
  isPartPlaybackPaused,
  toSongSheetPattern
} from '../song-sheet.helpers';
import { SongSheetChoice, SongSheetChoiceModalComponent, SongSheetChoiceModalData } from '../song-sheet-choice-modal.component';
import { getSongArrangement, getOccurrenceHistory } from '@/app/features/sheets/services/song-arrangement';
import { SongPartNotesModalComponent } from './song-part-notes-modal.component';
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
}

@Component({
  selector: 'app-song-part-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule, PlayingActionsComponent],
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
  readonly activeTab = signal<SongPartEditorTab>('music');
  readonly musicUnlocked = signal(false);
  readonly saving = signal(false);
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

  readonly musicLocked = computed(() => !this.musicUnlocked() &&
    getSongArrangement(this.sheet()).filter(occurrence => occurrence.partId === this.tempPart().id).length > 1);

  hasUnsavedChanges(): boolean {
    return JSON.stringify(this.tempPart()) !== this.savedPart || this.tempLyrics() !== this.savedLyrics;
  }

  async canLeave(): Promise<boolean> {
    if (!this.hasUnsavedChanges()) return true;
    const choice = await this.openChoiceDialog({ title: 'Keep your changes?', choices: [
      { value: 'save', text: 'Save and continue' },
      { value: 'discard', text: 'Discard changes' },
      { value: 'stay', text: 'Keep editing' }
    ] });
    if (choice === 'save') { await this.save(); return true; }
    return choice === 'discard';
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

  async editNotes(): Promise<void> {
    const ref = this.modalService.show(SongPartNotesModalComponent, {
      data: { notes: this.tempPart().notes, readOnly: this.musicLocked() }, width: '560px', maxWidth: '95vw', closeOnBackdropClick: false
    });
    const notes = await ref.afterClosed();
    if (notes !== undefined) this.updateNotes(notes);
  }

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
    this.songPartPlayback.stopMeasurePreview();
    this.songPartPlayback.stopSongPart();
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

  duplicateMeasure(measureIndex: number): void {
    if (this.musicLocked()) return;
    const part = this.tempPart();
    const measure = part.measures[measureIndex];
    if (!measure) {
      return;
    }

    const nextMeasures = [...part.measures];
    nextMeasures.splice(measureIndex + 1, 0, {
      ...cloneSongPartMeasure(measure),
      id: createSongSheetEntityId('spm')
    });
    this.tempPart.set({
      ...part,
      measures: nextMeasures
    });
    this.selectedMeasureIndex.set(measureIndex + 1);
    this.notificationService.success(`Copied measure ${measureIndex + 1}`);
  }

  async editMeasure(measureIndex: number): Promise<void> {
    if (this.musicLocked()) return;
    const part = this.tempPart();
    const partMeasure = part.measures[measureIndex];
    if (!partMeasure) {
      return;
    }

    const modalRef = this.modalService.show(SongPartMeasureEditorModalComponent, {
      data: {
        sheet: this.sheet(),
        part,
        measureId: partMeasure.id,
        occurrenceId: this.data.occurrence?.id,
        measure: partMeasure.measure,
        actionGrips: partMeasure.measure.actionGrips ?? [],
        measureLabel: `Measure ${measureIndex + 1}`
      },
      width: '95vw',
      height: '90vh',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: 'modal-xl',
      closeOnBackdropClick: false
    });

    const result: SongPartMeasureEditorResult | undefined = await modalRef.afterClosed();
    if (!result) {
      return;
    }

    const nextMeasures = [...this.tempPart().measures];
    nextMeasures[measureIndex] = {
      ...nextMeasures[measureIndex],
      measure: {
        ...result.measure,
        actionGrips: result.actionGrips.map(grip => ({ ...grip, measureIndex: 0 }))
      }
    };
    this.tempPart.update(current => ({
      ...current,
      measures: nextMeasures
    }));
    await this.refreshSheet();
  }

  startMeasureDrag(): void {
    this.isDraggingMeasure.set(true);
    // Render collapsed rows before CDK measures the drop targets.
    this.changeDetector.detectChanges();
  }

  dropMeasure(event: CdkDragDrop<SongPartMeasure[]>): void {
    if (this.musicLocked()) return;
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

  duplicateSelectedMeasure(): void {
    const selectedIndex = this.selectedMeasureIndex();
    if (selectedIndex === null) {
      return;
    }

    this.duplicateMeasure(selectedIndex);
  }

  removeSelectedMeasure(): void {
    const selectedIndex = this.selectedMeasureIndex();
    if (selectedIndex === null) {
      return;
    }

    this.removeMeasure(selectedIndex);
  }

  getPartMeasureNotationHistory(measureIndex: number): PlayingActionsNotationHistoryEntry[] {
    const history = this.data.occurrence ? getOccurrenceHistory(this.sheet(), this.data.occurrence.id, this.tempPart()).flatMap(part => part.measures) : [];
    return [...history, ...this.tempPart().measures.slice(0, measureIndex)].map(partMeasure => ({
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

  isPartPlaybackActive(part: SongPart): boolean {
    return isPartPlaybackActive(this.playbackState, part.id) && this.playbackState.occurrenceId === this.data.occurrence?.id;
  }

  isPartPlaybackPaused(part: SongPart): boolean {
    return isPartPlaybackPaused(this.playbackState, part.id);
  }

  getPartMeasureCounter(part: SongPart): string {
    return getPartMeasureCounter(this.playbackState, part.id, this.getPartMeasureCount(part));
  }

  canRewindPart(part: SongPart): boolean {
    return canRewindPart(this.playbackState, part.id);
  }

  canForwardPart(part: SongPart): boolean {
    return canForwardPart(this.playbackState, part.id);
  }

  async addContent(insertionIndex: number): Promise<void> {
    if (this.musicLocked()) return;
    const choices: SongSheetChoice[] = [
      { value: 'new-measure', text: 'New measure' }
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

    if (source === 'new-measure') {
      const timeSignature = this.tempPart().measures[insertionIndex - 1]?.measure.timeSignature ?? '4/4';
      this.insertMeasures(insertionIndex, [this.songSheetService.createEmptyPartMeasure(timeSignature)]);
      return;
    }

    let patterns: SongSheetPattern[] = [];
    if (source === 'from-sheet') {
      const selectedPattern = await this.selectSheetPattern();
      patterns = selectedPattern ? [selectedPattern] : [];
    } else if (source === 'from-library') {
      patterns = await this.importPatternsFromLibrary();
    } else if (source === 'create-new') {
      const createdPattern = await this.createPatternAndAddToSheet();
      patterns = createdPattern ? [createdPattern] : [];
    }

    this.insertMeasures(insertionIndex, patterns.flatMap(pattern => this.songSheetService.createMeasuresFromPattern(pattern)));
  }

  async toggleMeasurePlayback(part: SongPart, measure: SongPartMeasure): Promise<void> {
    await this.songPartPlayback.toggleMeasurePreview(this.sheet(), part, measure.id, this.data.occurrence?.id);
  }

  async playPart(part: SongPart): Promise<void> {
    await this.songPartPlayback.playSongPart(this.sheet(), part, this.data.occurrence?.id);
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

  async save(): Promise<void> {
    if (this.saving()) return;
    const part = this.tempPart();
    const cleanPart = cloneSongPart({
      ...part,
      section: part.section.trim() || 'Untitled part',
      notes: part.notes.trim()
    });
    this.saving.set(true);
    try {
      if (this.data.occurrence) {
        await this.songSheetService.saveOccurrence(this.sheet().id, this.data.occurrence.id, this.tempLyrics(), this.musicLocked() ? undefined : cleanPart);
        this.data.occurrence = { ...this.data.occurrence, partId: cleanPart.id, lyrics: this.tempLyrics() };
      } else if (this.editingPartIndex === null) {
        await this.songSheetService.addPart(this.sheet().id, cleanPart);
      } else if (!this.musicLocked()) {
        await this.songSheetService.updatePart(this.sheet().id, this.editingPartIndex, cleanPart);
      }
      this.tempPart.set(cleanPart);
      await this.refreshSheet();
      this.musicUnlocked.set(false);
      this.rememberSavedState();
      this.modalRef.close(true);
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

  private getPartMeasureCount(part: SongPart): number {
    return part.measures.length;
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

  private async createPatternAndAddToSheet(): Promise<SongSheetPattern | undefined> {
    const createdPattern = createEmptySongSheetPattern();
    const result = await this.openPatternEditor(createdPattern);
    if (!result) {
      return undefined;
    }

    const localPattern = toSongSheetPattern(result);
    await this.songSheetService.addPattern(localPattern, this.sheet().id);
    await this.refreshSheet();
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
      modalRef.componentInstance.savedGrips = this.sheet().grips;
      modalRef.componentInstance.tuning = this.sheet().tuning;
      modalRef.componentInstance.capodaster = this.sheet().capodaster;
      modalRef.componentInstance.tempo = this.sheet().tempo;
    }

    const result = await modalRef.afterClosed();
    return result ? cloneSongSheetPattern(result) : undefined;
  }
}
