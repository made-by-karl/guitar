import { Component, OnDestroy, TemplateRef, ViewChild, ViewContainerRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { ActivatedRoute } from '@angular/router';
import { SongSheetsService } from '@/app/features/sheets/services/song-sheets.service';
import {
  SongPart,
  SongPartActionGrip,
  SongPartBeatGrip,
  SongPartMeasureText,
  SongPartPatternItem,
  SongSheetGrip,
  SongSheetGripWithData,
  SongSheetPattern,
  SongSheetWithData
} from '@/app/features/sheets/services/song-sheets.model';
import { GripDiagramComponent } from '@/app/core/ui/grip-diagram/grip-diagram.component';
import { RhythmActionsComponent } from '@/app/features/patterns/ui/rhythm-actions/rhythm-actions.component';
import { PlaybackService } from '@/app/core/services/playback.service';
import { PatternPlaybackService } from '@/app/features/patterns/services/pattern-playback.service';
import { SongPartPlaybackService } from '@/app/features/sheets/services/song-part-playback.service';
import { GripService } from '@/app/features/grips/services/grips/grip.service';
import { Note, SEMITONES, Semitone, transpose } from '@/app/core/music/semitones';
import { DialogService } from '@/app/core/services/dialog.service';
import { BpmSelectorComponent } from '@/app/core/ui/bpm-selector/bpm-selector.component';
import { RhythmPattern, getBeatsFromTimeSignature } from '@/app/features/patterns/services/rhythm-patterns.model';
import { RhythmPatternEditorModalComponent } from '@/app/features/patterns/ui/rhythm-pattern-editor-modal/rhythm-pattern-editor-modal.component';
import { ModalRef, ModalService } from '@/app/core/services/modal.service';
import { Chord, chordToString } from '@/app/core/music/chords';
import { GripSelectorModalComponent, GripSelectorModalData } from '@/app/features/grips/ui/grip-selector-modal/grip-selector-modal.component';
import { stringifyGrip, TunedGrip } from '@/app/features/grips/services/grips/grip.model';
import { PatternLibrarySelectorModalComponent } from '@/app/features/patterns/ui/pattern-library-selector-modal/pattern-library-selector-modal.component';
import { RhythmPatternsService } from '@/app/features/patterns/services/rhythm-patterns.service';
import { TypedContextDirective } from '@/app/core/ui/directives/typed-context.directive';
import { Subscription } from 'rxjs';

type SheetChoiceValue = string;
type SongSheetTab = 'parts' | 'grips' | 'patterns';

interface SheetChoice {
  value: SheetChoiceValue;
  text: string;
}

interface SheetChoiceTemplateContext {
  title: string;
  choices: SheetChoice[];
}

interface SheetChoiceModalTemplateContext {
  $implicit: SheetChoiceTemplateContext;
  data: SheetChoiceTemplateContext;
  modalRef: ModalRef<SheetChoiceValue>;
}

interface PartEditorModalTemplateContext {
  $implicit: null;
  data: null;
  modalRef: ModalRef<void>;
}

interface TuningEditorModalTemplateContext {
  $implicit: null;
  data: null;
  modalRef: ModalRef<void>;
}

@Component({
  selector: 'app-song-sheet',
  standalone: true,
  imports: [CommonModule, FormsModule, GripDiagramComponent, RhythmActionsComponent, DragDropModule, BpmSelectorComponent, TypedContextDirective],
  templateUrl: './song-sheet.component.html',
  styleUrls: ['./song-sheet.component.scss']
})
export class SongSheetComponent implements OnDestroy {
  @ViewChild('sheetChoiceModal') sheetChoiceModalTemplate!: TemplateRef<SheetChoiceModalTemplateContext>;
  @ViewChild('partEditorModal') partEditorModalTemplate!: TemplateRef<PartEditorModalTemplateContext>;
  @ViewChild('tuningEditorModal') tuningEditorModalTemplate!: TemplateRef<TuningEditorModalTemplateContext>;

  sheet: SongSheetWithData | undefined;
  renaming = false;
  tempName = '';
  showTuningForm = false;

  editingPartIndex: number | null = null;
  tempPart: SongPart | null = null;

  readonly semitones: Semitone[] = [...SEMITONES];
  readonly octaves = [1, 2, 3, 4, 5, 6];

  tempTuning: Note[] = [];
  tempCapodaster = 0;
  tempTempo = 80;
  activeTab: SongSheetTab = 'parts';
  readonly sheetChoiceTemplateType = {} as SheetChoiceModalTemplateContext;
  readonly partEditorTemplateType = {} as PartEditorModalTemplateContext;
  readonly tuningEditorTemplateType = {} as TuningEditorModalTemplateContext;
  playbackState = { type: 'none', status: 'idle' } as ReturnType<SongPartPlaybackService['getSnapshot']>;
  patternPlaybackState = { status: 'idle' } as ReturnType<PatternPlaybackService['getSnapshot']>;
  private readonly playbackStateSubscription: Subscription;
  private readonly patternPlaybackStateSubscription: Subscription;

  constructor(
    private songSheetService: SongSheetsService,
    private rhythmPatternsService: RhythmPatternsService,
    private playback: PlaybackService,
    private songPartPlayback: SongPartPlaybackService,
    private patternPlayback: PatternPlaybackService,
    private gripService: GripService,
    private route: ActivatedRoute,
    private dialogService: DialogService,
    private modalService: ModalService,
    private viewContainerRef: ViewContainerRef
  ) {
    this.playbackState = this.songPartPlayback.getSnapshot();
    this.patternPlaybackState = this.patternPlayback.getSnapshot();
    this.playbackStateSubscription = this.songPartPlayback.state$.subscribe(state => {
      this.playbackState = state;
    });
    this.patternPlaybackStateSubscription = this.patternPlayback.state$.subscribe(state => {
      this.patternPlaybackState = state;
    });

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadSheet(id);
    }
  }

  ngOnDestroy(): void {
    this.playbackStateSubscription.unsubscribe();
    this.patternPlaybackStateSubscription.unsubscribe();
    this.patternPlayback.stopPatternPreview();
    this.songPartPlayback.stopMeasurePreview();
    this.songPartPlayback.stopSongPart();
  }

  async loadSheet(id: string) {
    this.sheet = await this.songSheetService.getByIdWithData(id);
    this.syncTempPart();
  }

  startRenaming() {
    if (!this.sheet) {
      return;
    }

    this.tempName = this.sheet.name;
    this.renaming = true;
  }

  async saveRename() {
    if (!this.sheet) {
      return;
    }

    this.sheet.name = this.tempName;
    await this.songSheetService.update(this.sheet);
    this.renaming = false;
  }

  cancelRename() {
    this.renaming = false;
    this.tempName = '';
  }

  async showTuning() {
    if (!this.sheet) {
      return;
    }

    this.tempTuning = [...this.sheet.tuning];
    this.tempCapodaster = this.sheet.capodaster;
    this.tempTempo = this.sheet.tempo;
    await this.openTuningEditorDialog();
  }

  async saveTuning(modalRef?: ModalRef<void>) {
    if (!this.sheet) {
      return;
    }

    this.sheet.tuning = [...this.tempTuning];
    this.sheet.capodaster = this.tempCapodaster;
    this.sheet.tempo = this.tempTempo;
    await this.songSheetService.update(this.sheet);
    this.showTuningForm = false;
    modalRef?.close();
  }

  cancelTuning(modalRef?: ModalRef<void>) {
    this.showTuningForm = false;
    modalRef?.close();
  }

  selectTab(tab: SongSheetTab) {
    this.activeTab = tab;
  }

  async dropGrip(event: CdkDragDrop<SongSheetGripWithData[]>) {
    if (!this.sheet || event.previousIndex === event.currentIndex) {
      return;
    }

    moveItemInArray(this.sheet.grips, event.previousIndex, event.currentIndex);
    await this.songSheetService.moveGrip(this.sheet.id, event.previousIndex, event.currentIndex);
    await this.refreshData();
  }

  async dropPattern(event: CdkDragDrop<SongSheetPattern[]>) {
    if (!this.sheet || event.previousIndex === event.currentIndex) {
      return;
    }

    moveItemInArray(this.sheet.patterns, event.previousIndex, event.currentIndex);
    await this.songSheetService.movePattern(this.sheet.id, event.previousIndex, event.currentIndex);
    await this.refreshData();
  }

  async dropPart(event: CdkDragDrop<SongPart[]>) {
    if (!this.sheet || event.previousIndex === event.currentIndex) {
      return;
    }

    moveItemInArray(this.sheet.parts, event.previousIndex, event.currentIndex);
    await this.songSheetService.movePart(this.sheet.id, event.previousIndex, event.currentIndex);
    await this.refreshData();
  }

  async removeGrip(gripId: string) {
    if (!this.sheet) {
      return;
    }

    await this.songSheetService.removeGrip(this.sheet.id, gripId);
    await this.refreshData();
  }

  async removePattern(patternId: string) {
    if (!this.sheet) {
      return;
    }

    try {
      await this.songSheetService.removePattern(this.sheet.id, patternId);
      await this.refreshData();
    } catch (error) {
      await this.dialogService.alert(
        'This pattern is still used in a song part. Remove or change those part items first.',
        'Pattern In Use',
        'OK',
        { variant: 'warning' }
      );
    }
  }

  async playGrip(grip: SongSheetGripWithData) {
    if (!this.sheet || !grip.grip) {
      return;
    }

    try {
      const tuning = this.sheet.tuning.map(note => transpose(note, this.sheet!.capodaster));
      const tunedGrip = this.gripService.toTunedGrip(grip.grip, tuning);
      const notes = tunedGrip.notes.filter((note): note is string => note !== null);

      if (notes.length > 0) {
        await this.playback.playChordFromNotes(notes);
      }
    } catch (error) {
      console.error('Error playing grip:', error);
    }
  }

  async playPattern(pattern: SongSheetPattern) {
    try {
      this.songPartPlayback.stopMeasurePreview();
      this.songPartPlayback.stopSongPart();
      const tuning = this.sheet
        ? this.sheet.tuning.map(note => transpose(note, this.sheet!.capodaster))
        : undefined;
      await this.patternPlayback.togglePatternPreview(pattern, tuning, undefined, this.sheet?.tempo);
    } catch (error) {
      console.error('Error playing rhythm pattern:', error);
    }
  }

  async toggleMeasurePlayback(part: SongPart, item: SongPartPatternItem, measureIndex: number) {
    if (!this.sheet) {
      return;
    }

    await this.songPartPlayback.toggleMeasurePreview(this.sheet, part, item.id, measureIndex);
  }

  async playPart(part: SongPart) {
    if (!this.sheet) {
      return;
    }

    await this.songPartPlayback.playSongPart(this.sheet, part);
  }

  pausePart() {
    this.songPartPlayback.pauseSongPart();
  }

  resumePart() {
    this.songPartPlayback.resumeSongPart();
  }

  stopPart() {
    this.songPartPlayback.stopSongPart();
  }

  rewindPart() {
    this.songPartPlayback.seekSongPartMeasure(-1);
  }

  forwardPart() {
    this.songPartPlayback.seekSongPartMeasure(1);
  }

  async showAddPart() {
    this.editingPartIndex = null;
    this.tempPart = this.createEmptyPart();
    await this.openPartEditorDialog();
  }

  async startEditingPart(partIndex: number) {
    if (!this.sheet) {
      return;
    }

    this.editingPartIndex = partIndex;
    this.tempPart = this.clonePart(this.sheet.parts[partIndex]);
    this.syncTempPart();
    await this.openPartEditorDialog();
  }

  cancelPartEdit(modalRef?: ModalRef<void>) {
    this.editingPartIndex = null;
    this.tempPart = null;
    modalRef?.close();
  }

  async savePart(modalRef?: ModalRef<void>) {
    if (!this.sheet || !this.tempPart || !this.tempPart.section.trim()) {
      return;
    }

    const part = this.clonePart({
      ...this.tempPart,
      section: this.tempPart.section.trim()
    });

    if (this.editingPartIndex === null) {
      await this.songSheetService.addPart(this.sheet.id, part);
    } else {
      await this.songSheetService.updatePart(this.sheet.id, this.editingPartIndex, part);
    }

    this.cancelPartEdit();
    await this.refreshData();
    modalRef?.close();
  }

  async removePart(partIndex: number) {
    if (!this.sheet) {
      return;
    }

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

    await this.songSheetService.removePart(this.sheet.id, partIndex);
    await this.refreshData();
  }

  async addPatternItem() {
    if (!this.sheet || !this.tempPart) {
      return;
    }

    const choices: SheetChoice[] = [];
    if (this.sheet.patterns.length > 0) {
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
        this.tempPart.items.push(this.songSheetService.createPatternItem(selectedPattern));
      }
      return;
    }

    if (source === 'from-library') {
      const importedPatterns = await this.importPatternsFromLibrary();
      if (importedPatterns.length > 0) {
        this.tempPart.items.push(...importedPatterns.map(pattern => this.songSheetService.createPatternItem(pattern)));
      }
      return;
    }

    if (source === 'create-new') {
      const createdPattern = await this.createPatternAndAddToSheet();
      if (createdPattern) {
        this.tempPart.items.push(this.songSheetService.createPatternItem(createdPattern));
      }
    }
  }

  removePatternItem(itemIndex: number) {
    this.tempPart?.items.splice(itemIndex, 1);
  }

  duplicatePatternItem(itemIndex: number) {
    if (!this.tempPart) {
      return;
    }

    const item = this.tempPart.items[itemIndex];
    this.tempPart.items.splice(itemIndex + 1, 0, {
      ...this.clonePartItem(item),
      id: this.createId('spi')
    });
  }

  async changePatternItem(item: SongPartPatternItem) {
    if (!this.sheet) {
      return;
    }

    const selectedPattern = await this.selectSheetPattern();
    if (!selectedPattern) {
      return;
    }

    item.patternId = selectedPattern.id;
    this.songSheetService.normalizePartItem(item, selectedPattern);
  }

  async editPattern(item: SongPartPatternItem) {
    if (!this.sheet) {
      return;
    }

    const pattern = this.getPattern(item.patternId);
    if (!pattern) {
      return;
    }

    let patternToEdit = pattern;
    const usageCount = this.songSheetService.getPatternUsageCount(this.sheet, pattern.id);

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
        patternToEdit = await this.songSheetService.duplicatePattern(this.sheet.id, pattern.id);
        item.patternId = patternToEdit.id;
      }
    }

    const editedPattern = await this.openPatternEditor(this.clonePattern(patternToEdit));
    if (!editedPattern) {
      await this.refreshData();
      return;
    }

    await this.songSheetService.updatePattern(this.sheet.id, editedPattern);
    await this.refreshData();

    if (this.tempPart) {
      const currentItem = this.tempPart.items.find(existing => existing.id === item.id);
      if (currentItem) {
        currentItem.patternId = editedPattern.id;
        this.songSheetService.normalizePartItem(currentItem, this.getPattern(editedPattern.id));
      }
    }
  }

  getPattern(patternId: string): SongSheetPattern | undefined {
    return this.sheet?.patterns.find(pattern => pattern.id === patternId);
  }

  getPatternName(patternId: string): string {
    return this.getPattern(patternId)?.name || 'Unknown Pattern';
  }

  getTuningDisplay(): string {
    if (!this.sheet) {
      return '';
    }

    return this.sheet.tuning.map(note => `${note.semitone}${note.octave}`).join(' | ');
  }

  getMeasureText(item: SongPartPatternItem, measureIndex: number): SongPartMeasureText {
    let text = item.measureTexts.find(existing => existing.measureIndex === measureIndex);
    if (!text) {
      text = { measureIndex, lyrics: '', notes: '' };
      item.measureTexts.push(text);
    }
    return text;
  }

  getBeatGrip(item: SongPartPatternItem, measureIndex: number, beatIndex: number): SongPartBeatGrip | undefined {
    return item.beatGrips.find(grip => grip.measureIndex === measureIndex && grip.beatIndex === beatIndex);
  }

  getEffectiveBeatGrip(
    item: SongPartPatternItem,
    pattern: SongSheetPattern,
    measureIndex: number,
    beatIndex: number
  ): SongPartBeatGrip | undefined {
    return this.getBeatGrip(item, measureIndex, beatIndex) ??
      pattern.beatGrips?.find(grip => grip.measureIndex === measureIndex && grip.beatIndex === beatIndex);
  }

  getActionGrip(item: SongPartPatternItem, measureIndex: number, actionIndex: number): SongPartActionGrip | undefined {
    return item.actionGripOverrides.find(grip => grip.measureIndex === measureIndex && grip.actionIndex === actionIndex);
  }

  getEffectiveActionGrip(
    item: SongPartPatternItem,
    pattern: SongSheetPattern,
    measureIndex: number,
    actionIndex: number
  ): SongPartActionGrip | undefined {
    return this.getActionGrip(item, measureIndex, actionIndex) ??
      pattern.actionGripOverrides?.find(grip => grip.measureIndex === measureIndex && grip.actionIndex === actionIndex);
  }

  async assignBeatGrip(item: SongPartPatternItem, measureIndex: number, beatIndex: number) {
    const selectedGrip = await this.selectGrip(this.getBeatGrip(item, measureIndex, beatIndex)?.chordName);
    if (selectedGrip === undefined) {
      return;
    }

    item.beatGrips = item.beatGrips.filter(grip => !(grip.measureIndex === measureIndex && grip.beatIndex === beatIndex));
    if (selectedGrip) {
      item.beatGrips.push({
        measureIndex,
        beatIndex,
        gripId: selectedGrip.gripId,
        chordName: selectedGrip.chordName
      });
    }
  }

  async assignActionGrip(item: SongPartPatternItem, measureIndex: number, actionIndex: number) {
    const selectedGrip = await this.selectGrip(this.getActionGrip(item, measureIndex, actionIndex)?.chordName);
    if (selectedGrip === undefined) {
      return;
    }

    item.actionGripOverrides = item.actionGripOverrides.filter(
      grip => !(grip.measureIndex === measureIndex && grip.actionIndex === actionIndex)
    );
    if (selectedGrip) {
      item.actionGripOverrides.push({
        measureIndex,
        actionIndex,
        gripId: selectedGrip.gripId,
        chordName: selectedGrip.chordName
      });
    }
  }

  clearMeasureGrips(item: SongPartPatternItem, measureIndex: number) {
    item.beatGrips = item.beatGrips.filter(grip => grip.measureIndex !== measureIndex);
    item.actionGripOverrides = item.actionGripOverrides.filter(grip => grip.measureIndex !== measureIndex);
  }

  getBeatIndices(pattern: SongSheetPattern, measureIndex: number): number[] {
    const measure = pattern.measures[measureIndex];
    return Array.from({ length: getBeatsFromTimeSignature(measure.timeSignature) }, (_, index) => index);
  }

  getActionIndices(pattern: SongSheetPattern, measureIndex: number): number[] {
    return pattern.measures[measureIndex].actions
      .map((action, index) => action ? index : -1)
      .filter(index => index >= 0);
  }

  isMeasurePlaybackActive(item: SongPartPatternItem, measureIndex: number): boolean {
    return this.playbackState.type === 'measure' &&
      this.playbackState.status === 'playing' &&
      this.playbackState.itemId === item.id &&
      this.playbackState.itemMeasureIndex === measureIndex;
  }

  isPartPlaybackActive(part: SongPart): boolean {
    return this.playbackState.type === 'part' && this.playbackState.partId === part.id;
  }

  isPartPlaybackPaused(part: SongPart): boolean {
    return this.isPartPlaybackActive(part) && this.playbackState.status === 'paused';
  }

  isPatternPlaybackActive(pattern: SongSheetPattern): boolean {
    return this.patternPlaybackState.status === 'playing' && this.patternPlaybackState.patternId === pattern.id;
  }

  getPartMeasureCounter(part: SongPart): string {
    const totalMeasures = this.songSheetService.resolvePartMeasures(this.sheet!, part).length;
    if (!this.isPartPlaybackActive(part)) {
      return totalMeasures > 0 ? `Measure 1 / ${totalMeasures}` : 'No measures';
    }

    return `Measure ${(this.playbackState.currentMeasureIndex ?? 0) + 1} / ${this.playbackState.totalMeasures ?? totalMeasures}`;
  }

  canRewindPart(part: SongPart): boolean {
    return this.isPartPlaybackActive(part) && (this.playbackState.currentMeasureIndex ?? 0) > 0;
  }

  canForwardPart(part: SongPart): boolean {
    return this.isPartPlaybackActive(part) &&
      (this.playbackState.currentMeasureIndex ?? 0) < ((this.playbackState.totalMeasures ?? 1) - 1);
  }

  trackByPatternId(_: number, pattern: SongSheetPattern): string {
    return pattern.id;
  }

  trackByGripId(_: number, grip: SongSheetGripWithData): string {
    return grip.gripId;
  }

  trackByPartId(_: number, part: SongPart): string {
    return part.id;
  }

  trackByItemId(_: number, item: SongPartPatternItem): string {
    return item.id;
  }

  async addGrip(chordName?: string) {
    if (!this.sheet) {
      return;
    }

    await this.openGripSelector(chordName);
  }

  private async refreshData() {
    if (!this.sheet) {
      return;
    }

    this.sheet = await this.songSheetService.getByIdWithData(this.sheet.id);
    this.syncTempPart();
  }

  private syncTempPart() {
    if (!this.tempPart || !this.sheet) {
      return;
    }

    for (const item of this.tempPart.items) {
      this.songSheetService.normalizePartItem(item, this.getPattern(item.patternId));
    }
  }

  private createEmptyPart(): SongPart {
    return {
      id: this.createId('sp'),
      section: '',
      items: []
    };
  }

  private clonePart(part: SongPart): SongPart {
    return {
      id: part.id,
      section: part.section,
      items: part.items.map(item => this.clonePartItem(item))
    };
  }

  private clonePartItem(item: SongPartPatternItem): SongPartPatternItem {
    return {
      id: item.id,
      patternId: item.patternId,
      measureTexts: item.measureTexts.map(text => ({ ...text })),
      beatGrips: item.beatGrips.map(grip => ({ ...grip })),
      actionGripOverrides: item.actionGripOverrides.map(grip => ({ ...grip }))
    };
  }

  private clonePattern(pattern: RhythmPattern): SongSheetPattern {
    return {
      ...pattern,
      beatGrips: (pattern.beatGrips ?? []).map(grip => ({ ...grip })),
      actionGripOverrides: (pattern.actionGripOverrides ?? []).map(grip => ({ ...grip })),
      measures: pattern.measures.map(measure => ({
        ...measure,
        actions: measure.actions.map(action => action ? {
          ...action,
          modifiers: action.modifiers ? [...action.modifiers] : undefined,
          strum: action.strum ? { ...action.strum } : undefined,
          pick: action.pick ? action.pick.map(note => ({ ...note })) : undefined,
          percussive: action.percussive ? { ...action.percussive } : undefined
        } : null)
      }))
    };
  }

  private async selectGrip(chordName?: string): Promise<SongSheetGrip | null | undefined> {
    if (!this.sheet) {
      return undefined;
    }

    const choices: SheetChoice[] = this.sheet.grips.map(grip => ({
      value: 'grip:' + grip.gripId,
      text: grip.chordName
    }));
    choices.push(
      { value: 'create-new', text: 'Create new grip' },
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

    if (choice === 'create-new') {
      return this.openGripSelector(chordName);
    }

    const gripId = choice.replace('grip:', '');
    const selectedGrip = this.sheet.grips.find(grip => grip.gripId === gripId);
    return selectedGrip ? { gripId: selectedGrip.gripId, chordName: selectedGrip.chordName } : undefined;
  }

  private async openGripSelector(chord?: Chord | string): Promise<SongSheetGrip | undefined> {
    if (!this.sheet) {
      return undefined;
    }

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
      gripId: stringifyGrip(grip),
      chordName: chordToString(result.chord)
    }));

    await this.songSheetService.addGrips(songSheetGrips, this.sheet.id);
    await this.refreshData();
    return songSheetGrips[0];
  }

  async addPatterns() {
    if (!this.sheet) {
      return;
    }

    const choices: SheetChoice[] = [];
    if (this.sheet.patterns.length > 0) {
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
      await this.importPatternsFromLibrary();
      return;
    }

    if (choice === 'create-new') {
      await this.createPatternAndAddToSheet();
    }
  }

  private async selectSheetPattern(): Promise<SongSheetPattern | undefined> {
    if (!this.sheet || this.sheet.patterns.length === 0) {
      return undefined;
    }

    const choice = await this.openChoiceDialog({
      title: 'Choose Sheet Pattern',
      choices: this.sheet.patterns.map(pattern => ({
        value: pattern.id,
        text: pattern.name || 'Untitled Pattern'
      }))
    });

    if (!choice) {
      return undefined;
    }

    return this.sheet.patterns.find(pattern => pattern.id === choice);
  }

  private async openChoiceDialog(context: SheetChoiceTemplateContext): Promise<SheetChoiceValue | undefined> {
    if (!this.sheetChoiceModalTemplate) {
      return undefined;
    }

    const modalRef = this.modalService.showTemplate<SheetChoiceValue, SheetChoiceTemplateContext>(
      this.sheetChoiceModalTemplate,
      this.viewContainerRef,
      {
        data: context,
        width: '420px',
        maxWidth: '95vw',
        closeOnBackdropClick: true
      }
    );

    return modalRef.afterClosed();
  }

  private async openPartEditorDialog(): Promise<void> {
    if (!this.partEditorModalTemplate) {
      return;
    }

    const modalRef = this.modalService.showTemplate<void, null>(
      this.partEditorModalTemplate,
      this.viewContainerRef,
      {
        data: null,
        width: '95vw',
        height: '90vh',
        maxWidth: '95vw',
        maxHeight: '90vh',
        panelClass: 'modal-xl',
        closeOnBackdropClick: false
      }
    );

    await modalRef.afterClosed();
  }

  private async openTuningEditorDialog(): Promise<void> {
    if (!this.tuningEditorModalTemplate) {
      return;
    }

    const modalRef = this.modalService.showTemplate<void, null>(
      this.tuningEditorModalTemplate,
      this.viewContainerRef,
      {
        data: null,
        width: '720px',
        maxWidth: '95vw',
        closeOnBackdropClick: false
      }
    );

    await modalRef.afterClosed();
  }

  private async importPatternsFromLibrary(): Promise<SongSheetPattern[]> {
    if (!this.sheet) {
      return [];
    }

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

    const importedPatterns = result.patterns.map((pattern: RhythmPattern) => this.toSongSheetPattern(pattern));
    await this.songSheetService.addPatterns(importedPatterns, this.sheet.id);
    await this.refreshData();
    return importedPatterns;
  }

  private async createPatternAndAddToSheet(): Promise<SongSheetPattern | undefined> {
    if (!this.sheet) {
      return undefined;
    }

    const createdPattern = this.createEmptyPattern();
    const result = await this.openPatternEditor(createdPattern);
    if (!result) {
      return undefined;
    }

    const localPattern = this.toSongSheetPattern(result);
    await this.songSheetService.addPattern(localPattern, this.sheet.id);
    await this.refreshData();
    return localPattern;
  }

  private createEmptyPattern(): SongSheetPattern {
    const now = Date.now();
    return {
      id: this.createId('pat'),
      name: '',
      description: '',
      category: '',
      measures: [{
        timeSignature: '4/4',
        actions: Array(16).fill(null)
      }],
      beatGrips: [],
      actionGripOverrides: [],
      createdAt: now,
      updatedAt: now,
      isCustom: true
    };
  }

  private toSongSheetPattern(pattern: RhythmPattern): SongSheetPattern {
    return this.clonePattern({
      ...pattern,
      id: this.createId('pat'),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isCustom: true
    });
  }

  private async openPatternEditor(pattern: SongSheetPattern): Promise<SongSheetPattern | undefined> {
    const modalRef = this.modalService.show(RhythmPatternEditorModalComponent, {
      width: '95vw',
      height: '90vh',
      maxHeight: '90vh',
      panelClass: 'modal-xl',
      closeOnBackdropClick: false
    });

    if (modalRef.componentInstance) {
      modalRef.componentInstance.pattern = this.clonePattern(pattern);
    }

    const result = await modalRef.afterClosed();
    return result ? this.clonePattern(result) : undefined;
  }

  private createId(prefix: string): string {
    return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  }
}
