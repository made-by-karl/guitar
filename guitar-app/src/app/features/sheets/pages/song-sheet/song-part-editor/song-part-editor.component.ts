import { CommonModule } from '@angular/common';
import { Component, Inject, OnDestroy, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { MODAL_DATA, MODAL_REF, ModalComponent, ModalDataComponent, ModalRef, ModalService } from '@/app/core/services/modal.service';
import { Chord, chordToString } from '@/app/core/music/chords';
import { getSixteenthPerBeatFromTimeSignature, PlayingPattern } from '@/app/features/patterns/services/playing-patterns.model';
import { PatternLibrarySelectorModalComponent } from '@/app/features/patterns/ui/pattern-library-selector-modal/pattern-library-selector-modal.component';
import { PlayingActionsComponent, PlayingActionsNotationContext } from '@/app/features/patterns/ui/playing-actions/playing-actions.component';
import { PlayingPatternEditorModalComponent } from '@/app/features/patterns/ui/playing-pattern-editor-modal/playing-pattern-editor-modal.component';
import { GripSelectorModalComponent, GripSelectorModalData } from '@/app/features/grips/ui/grip-selector-modal/grip-selector-modal.component';
import { serializeGrip, TunedGrip } from '@/app/features/grips/services/grips/grip.model';
import {
  SongPart,
  SongPartActionGrip,
  SongPartMeasureText,
  SongPartPatternItem,
  SongSheetGrip,
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
  cloneSongPartItem,
  cloneSongSheetPattern,
  createEmptySongSheetPattern,
  createSongSheetEntityId,
  getPartMeasureCounter,
  isPartPlaybackActive,
  isPartPlaybackPaused,
  toSongSheetPattern
} from '../song-sheet.helpers';
import { SongSheetChoice, SongSheetChoiceModalComponent, SongSheetChoiceModalData } from '../song-sheet-choice-modal.component';

type ActionSubdivision = 'quarter' | 'eighth' | 'sixteenth';

interface ActionGripPosition {
  actionIndex: number;
  label: string;
  subdivision: ActionSubdivision;
}

export interface SongPartEditorModalData {
  sheet: SongSheetWithData;
  part: SongPart;
  editingPartIndex: number | null;
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
  readonly isDraggingPatternItem = signal(false);
  readonly sheet;
  readonly tempPart;
  readonly editingPartIndex;
  playbackState = { type: 'none', status: 'idle' } as SongSheetPlaybackState;

  private readonly expandedMeasureGripKeys = signal(new Set<string>());
  private readonly patternNames = computed(() => (
    new Map(this.sheet().patterns.map(pattern => [pattern.id, pattern.name || 'Untitled Pattern']))
  ));
  private readonly playbackStateSubscription: Subscription;

  constructor(
    @Inject(MODAL_REF) public modalRef: ModalRef<boolean>,
    @Inject(MODAL_DATA) public data: SongPartEditorModalData,
    private readonly songSheetService: SongSheetsService,
    private readonly songPartPlayback: SongPartPlaybackService,
    private readonly modalService: ModalService
  ) {
    this.sheet = signal<SongSheetWithData>(this.data.sheet);
    this.tempPart = signal<SongPart>(cloneSongPart(this.data.part));
    this.editingPartIndex = this.data.editingPartIndex;
    this.syncTempPart();
    this.playbackState = this.songPartPlayback.getSnapshot();
    this.playbackStateSubscription = this.songPartPlayback.state$.subscribe(state => {
      this.playbackState = state;
    });
  }

  ngOnDestroy(): void {
    this.playbackStateSubscription.unsubscribe();
    this.songPartPlayback.stopMeasurePreview();
    this.songPartPlayback.stopSongPart();
  }

  updateSectionName(section: string): void {
    this.tempPart.update(part => ({
      ...part,
      section
    }));
  }

  removePatternItem(itemIndex: number): void {
    this.tempPart.update(part => ({
      ...part,
      items: part.items.filter((_, index) => index !== itemIndex)
    }));
  }

  duplicatePatternItem(itemIndex: number): void {
    const part = this.tempPart();
    const item = part.items[itemIndex];
    if (!item) {
      return;
    }

    const nextItems = [...part.items];
    nextItems.splice(itemIndex + 1, 0, {
      ...cloneSongPartItem(item),
      id: createSongSheetEntityId('spi')
    });
    this.tempPart.set({
      ...part,
      items: nextItems
    });
  }

  dropPatternItem(event: CdkDragDrop<SongPartPatternItem[]>): void {
    this.isDraggingPatternItem.set(false);
    const part = this.tempPart();
    if (event.previousIndex === event.currentIndex) {
      return;
    }

    const nextItems = [...part.items];
    moveItemInArray(nextItems, event.previousIndex, event.currentIndex);
    this.tempPart.set({
      ...part,
      items: nextItems
    });
  }

  getPattern(patternId: string): SongSheetPattern | undefined {
    return this.sheet().patterns.find(pattern => pattern.id === patternId);
  }

  getPatternName(patternId: string): string {
    return this.patternNames().get(patternId) || 'Unknown Pattern';
  }

  getMeasureText(item: SongPartPatternItem, measureIndex: number): SongPartMeasureText {
    let text = item.measureTexts.find(existing => existing.measureIndex === measureIndex);
    if (!text) {
      text = { measureIndex, lyrics: '', notes: '' };
      item.measureTexts.push(text);
    }
    return text;
  }

  clearMeasureGrips(item: SongPartPatternItem, measureIndex: number): void {
    item.actionGrips = item.actionGrips.filter(grip => grip.measureIndex !== measureIndex);
  }

  getActionGrip(item: SongPartPatternItem, measureIndex: number, actionIndex: number): SongPartActionGrip | undefined {
    return item.actionGrips.find(grip => grip.measureIndex === measureIndex && grip.actionIndex === actionIndex);
  }

  getEffectiveActionGrip(
    item: SongPartPatternItem,
    pattern: SongSheetPattern,
    measureIndex: number,
    actionIndex: number
  ): SongPartActionGrip | undefined {
    return this.getActionGrip(item, measureIndex, actionIndex) ??
      pattern.actionGrips?.find(grip => grip.measureIndex === measureIndex && grip.actionIndex === actionIndex);
  }

  isMeasureGripsExpanded(item: SongPartPatternItem, measureIndex: number): boolean {
    return this.expandedMeasureGripKeys().has(this.getMeasureGripKey(item, measureIndex));
  }

  toggleMeasureGrips(item: SongPartPatternItem, measureIndex: number): void {
    const key = this.getMeasureGripKey(item, measureIndex);
    this.expandedMeasureGripKeys.update(keys => {
      const next = new Set(keys);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  getMeasureGripNames(item: SongPartPatternItem, pattern: SongSheetPattern, measureIndex: number): string[] {
    return this.getActionGripPositions(pattern, measureIndex)
      .map(actionData => this.getEffectiveActionGrip(item, pattern, measureIndex, actionData.actionIndex)?.chordName)
      .filter((chordName): chordName is string => !!chordName);
  }

  getActionGripPositions(pattern: SongSheetPattern, measureIndex: number): ActionGripPosition[] {
    const measure = pattern.measures[measureIndex];
    if (!measure) {
      return [];
    }

    const sixteenthPerBeat = getSixteenthPerBeatFromTimeSignature(measure.timeSignature);
    return measure.actions.map((_, actionIndex) => {
      const subdivision = this.getActionSubdivision(actionIndex);
      return {
        actionIndex,
        subdivision,
        label: `${Math.floor(actionIndex / sixteenthPerBeat) + 1} ${subdivision.substring(0, 1).toUpperCase()}`
      };
    });
  }

  getPartMeasureNotationContext(
    item: SongPartPatternItem,
    pattern: SongSheetPattern,
    measureIndex: number
  ): PlayingActionsNotationContext {
    const actionGrips: SongPartActionGrip[] = [];
    for (let actionIndex = 0; actionIndex < pattern.measures[measureIndex].actions.length; actionIndex++) {
      const effective = this.getEffectiveActionGrip(item, pattern, measureIndex, actionIndex);
      if (effective) {
        actionGrips.push({
          measureIndex,
          actionIndex,
          gripId: effective.gripId,
          chordName: effective.chordName
        });
      }
    }

    return {
      timeSignature: pattern.measures[measureIndex].timeSignature,
      actionGrips,
      gripById: buildGripByIdMap(this.sheet())
    };
  }

  isMeasurePlaybackActive(item: SongPartPatternItem, measureIndex: number): boolean {
    return this.playbackState.type === 'measure' &&
      this.playbackState.status === 'playing' &&
      this.playbackState.itemId === item.id &&
      this.playbackState.itemMeasureIndex === measureIndex;
  }

  isPartPlaybackActive(part: SongPart): boolean {
    return isPartPlaybackActive(this.playbackState, part.id);
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

  async addPatternItem(): Promise<void> {
    const choices: SongSheetChoice[] = [];
    if (this.sheet().patterns.length > 0) {
      choices.push({ value: 'from-sheet', text: 'Use sheet pattern' });
    }
    choices.push(
      { value: 'from-library', text: 'Import from library' },
      { value: 'create-new', text: 'Create new pattern' }
    );

    const source = await this.openChoiceDialog({
      title: 'Add Pattern To Part',
      choices
    });

    if (source === 'from-sheet') {
      const selectedPattern = await this.selectSheetPattern();
      if (selectedPattern) {
        this.tempPart.update(part => ({
          ...part,
          items: [...part.items, this.songSheetService.createPatternItem(selectedPattern)]
        }));
      }
      return;
    }

    if (source === 'from-library') {
      const importedPatterns = await this.importPatternsFromLibrary();
      if (importedPatterns.length > 0) {
        this.tempPart.update(part => ({
          ...part,
          items: [
            ...part.items,
            ...importedPatterns.map(pattern => this.songSheetService.createPatternItem(pattern))
          ]
        }));
      }
      return;
    }

    if (source === 'create-new') {
      const createdPattern = await this.createPatternAndAddToSheet();
      if (createdPattern) {
        this.tempPart.update(part => ({
          ...part,
          items: [...part.items, this.songSheetService.createPatternItem(createdPattern)]
        }));
      }
    }
  }

  async changePatternItem(item: SongPartPatternItem): Promise<void> {
    const selectedPattern = await this.selectSheetPattern();
    if (!selectedPattern) {
      return;
    }

    item.patternId = selectedPattern.id;
    this.songSheetService.normalizePartItem(item, selectedPattern);
  }

  async editPattern(item: SongPartPatternItem): Promise<void> {
    const pattern = this.getPattern(item.patternId);
    if (!pattern) {
      return;
    }

    let patternToEdit = pattern;
    const usageCount = this.songSheetService.getPatternUsageCount(this.sheet(), pattern.id);

    if (usageCount > 1) {
      const choice = await this.openChoiceDialog({
        title: 'Edit Reused Pattern',
        choices: [
          { value: 'update-all', text: 'Update all uses' },
          { value: 'duplicate', text: 'Duplicate into variation' }
        ]
      });

      if (!choice) {
        return;
      }

      if (choice === 'duplicate') {
        patternToEdit = await this.songSheetService.duplicatePattern(this.sheet().id, pattern.id);
        item.patternId = patternToEdit.id;
        await this.refreshSheet();
      }
    }

    const editedPattern = await this.openPatternEditor(cloneSongSheetPattern(patternToEdit));
    if (!editedPattern) {
      await this.refreshSheet();
      return;
    }

    await this.songSheetService.updatePattern(this.sheet().id, editedPattern);
    await this.refreshSheet();
    this.songSheetService.normalizePartItem(item, this.getPattern(item.patternId));
  }

  async toggleMeasurePlayback(part: SongPart, item: SongPartPatternItem, measureIndex: number): Promise<void> {
    await this.songPartPlayback.toggleMeasurePreview(this.sheet(), part, item.id, measureIndex);
  }

  async assignActionGrip(
    item: SongPartPatternItem,
    pattern: SongSheetPattern,
    measureIndex: number,
    actionIndex: number
  ): Promise<void> {
    const effectiveGrip = item.actionGrips.find(grip => grip.measureIndex === measureIndex && grip.actionIndex === actionIndex) ??
      pattern.actionGrips?.find(grip => grip.measureIndex === measureIndex && grip.actionIndex === actionIndex);
    const selectedGrip = await this.selectGrip(effectiveGrip?.chordName);
    if (selectedGrip === undefined) {
      return;
    }

    item.actionGrips = item.actionGrips.filter(
      grip => !(grip.measureIndex === measureIndex && grip.actionIndex === actionIndex)
    );
    if (selectedGrip) {
      item.actionGrips.push({
        measureIndex,
        actionIndex,
        gripId: selectedGrip.gripId,
        chordName: selectedGrip.chordName
      });
    }
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

  cancel(): void {
    this.modalRef.close(undefined);
  }

  async save(): Promise<void> {
    const part = this.tempPart();
    if (!part.section.trim()) {
      return;
    }

    const cleanPart = cloneSongPart({
      ...part,
      section: part.section.trim()
    });

    if (this.editingPartIndex === null) {
      await this.songSheetService.addPart(this.sheet().id, cleanPart);
    } else {
      await this.songSheetService.updatePart(this.sheet().id, this.editingPartIndex, cleanPart);
    }

    this.modalRef.close(true);
  }

  private getPartMeasureCount(part: SongPart): number {
    return part.items.reduce((count, item) => (
      count + (this.getPattern(item.patternId)?.measures.length ?? 0)
    ), 0);
  }

  private getActionSubdivision(actionIndex: number): ActionSubdivision {
    if (actionIndex % 4 === 0) return 'quarter';
    if (actionIndex % 2 === 0) return 'eighth';
    return 'sixteenth';
  }

  private getMeasureGripKey(item: SongPartPatternItem, measureIndex: number): string {
    return `${item.id}:${measureIndex}`;
  }

  private async refreshSheet(): Promise<void> {
    const sheet = await this.songSheetService.getByIdWithData(this.sheet().id);
    if (sheet) {
      this.sheet.set(sheet);
      this.syncTempPart();
    }
  }

  private syncTempPart(): void {
    const part = this.tempPart();
    for (const item of part.items) {
      this.songSheetService.normalizePartItem(item, this.getPattern(item.patternId));
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

  private async selectGrip(chordName?: string): Promise<SongSheetGrip | null | undefined> {
    const choices: SongSheetChoice[] = this.sheet().grips.map(grip => ({
      value: 'grip:' + grip.gripId,
      text: grip.chordName
    }));
    choices.push(
      { value: 'grip-from-chord', text: 'Grip from chord' },
      { value: 'clear', text: 'Clear assignment' }
    );

    const choice = await this.openChoiceDialog({
      title: 'Select Grip',
      choices
    });

    if (!choice) {
      return undefined;
    }

    if (choice === 'clear') {
      return null;
    }

    if (choice === 'grip-from-chord') {
      return this.openGripSelector(chordName);
    }

    const gripId = choice.replace('grip:', '');
    const selectedGrip = this.sheet().grips.find(grip => grip.gripId === gripId);
    return selectedGrip ? { gripId: selectedGrip.gripId, chordName: selectedGrip.chordName } : undefined;
  }

  private async openGripSelector(chord?: Chord | string): Promise<SongSheetGrip | undefined> {
    const data: GripSelectorModalData = { chord };
    const modalRef = this.modalService.show(GripSelectorModalComponent, {
      data,
      width: '95vw',
      height: '90vh',
      maxHeight: '90vh',
      panelClass: 'modal-xl',
      closeOnBackdropClick: true
    });

    const result = await modalRef.afterClosed();
    if (!result || result.grips.length === 0) {
      return undefined;
    }

    const songSheetGrips = result.grips.map((grip: TunedGrip): SongSheetGrip => ({
      gripId: serializeGrip(grip),
      chordName: chordToString(result.chord)
    }));

    await this.songSheetService.addGrips(songSheetGrips, this.sheet().id);
    await this.refreshSheet();
    return songSheetGrips[0];
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
    }

    const result = await modalRef.afterClosed();
    return result ? cloneSongSheetPattern(result) : undefined;
  }
}
