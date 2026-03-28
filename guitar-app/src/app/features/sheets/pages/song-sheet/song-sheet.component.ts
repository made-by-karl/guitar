import { Component, TemplateRef, ViewChild, ViewContainerRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { SongSheetsService } from '@/app/features/sheets/services/song-sheets.service';
import { SongSheetWithData, SongSheetGripWithData, SongSheetPatternWithData, SongPart, SongSheetPattern, SongSheetGrip } from '@/app/features/sheets/services/song-sheets.model';
import { GripDiagramComponent } from '@/app/core/ui/grip-diagram/grip-diagram.component';
import { RhythmActionsComponent } from '@/app/features/patterns/ui/rhythm-actions/rhythm-actions.component';
import { PlaybackService } from '@/app/core/services/playback.service';
import { ActivatedRoute, Router } from '@angular/router';
import { GripService } from '@/app/features/grips/services/grips/grip.service';
import { Note, SEMITONES, Semitone, transpose } from '@/app/core/music/semitones';
import { DialogService } from '@/app/core/services/dialog.service';
import { BpmSelectorComponent } from '@/app/core/ui/bpm-selector/bpm-selector.component';
import {RhythmPattern} from '@/app/features/patterns/services/rhythm-patterns.model';
import {
  RhythmPatternEditorModalComponent
} from '@/app/features/patterns/ui/rhythm-pattern-editor-modal/rhythm-pattern-editor-modal.component';
import {ModalRef, ModalService} from '@/app/core/services/modal.service';
import {Chord, chordToString} from '@/app/core/music/chords';
import {
  GripSelectorModalComponent,
  GripSelectorModalData
} from '@/app/features/grips/ui/grip-selector-modal/grip-selector-modal.component';
import {stringifyGrip, TunedGrip} from '@/app/features/grips/services/grips/grip.model';
import {
  PatternLibrarySelectorModalComponent
} from '@/app/features/patterns/ui/pattern-library-selector-modal/pattern-library-selector-modal.component';
import {RhythmPatternsService} from '@/app/features/patterns/services/rhythm-patterns.service';
import {TypedContextDirective} from '@/app/core/ui/directives/typed-context.directive';

type SheetChoiceValue = string;

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

@Component({
  selector: 'app-song-sheet',
  standalone: true,
  imports: [CommonModule, FormsModule, GripDiagramComponent, RhythmActionsComponent, DragDropModule, BpmSelectorComponent, TypedContextDirective],
  templateUrl: './song-sheet.component.html',
  styleUrls: ['./song-sheet.component.scss']
})
export class SongSheetComponent {
  @ViewChild('sheetChoiceModal') sheetChoiceModalTemplate!: TemplateRef<SheetChoiceModalTemplateContext>;

  sheet: SongSheetWithData | undefined;
  renaming = false;
  tempName = '';
  showTuningForm = false;

  // For editing song parts
  editingPartIndex: number | null = null;
  showAddPartForm = false;
  tempPartSection = '';
  tempPartPatterns: {
    pattern: SongSheetPattern,
    grips: { grip: SongSheetGrip, startAction: number }[]
  }[] = [];

  // For tuning form
  readonly semitones: Semitone[] = [...SEMITONES];
  readonly octaves = [1, 2, 3, 4, 5, 6];

  // Temporary tuning values for form
  tempTuning: Note[] = [];
  tempCapodaster = 0;
  tempTempo = 80;
  readonly sheetChoiceTemplateType = {} as SheetChoiceModalTemplateContext;

  private readonly patternSourceChoices: SheetChoiceTemplateContext = {
    title: 'Add Pattern',
    choices: [
      { value: 'from-library', text: 'From library' },
      { value: 'create-new', text: 'Create new' }
    ]
  };

  constructor(
    private songSheetService: SongSheetsService,
    private rhythmPatternsService: RhythmPatternsService,
    private playback: PlaybackService,
    private gripService: GripService,
    private route: ActivatedRoute,
    private router: Router,
    private dialogService: DialogService,
    private modalService: ModalService,
    private viewContainerRef: ViewContainerRef
  ) {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadSheet(id);
    }
  }

  async loadSheet(id: string) {
    this.sheet = await this.songSheetService.getByIdWithData(id);
  }

  startRenaming() {
    if (this.sheet) {
      this.tempName = this.sheet.name;
      this.renaming = true;
    }
  }

  async saveRename() {
    if (this.sheet) {
      this.sheet.name = this.tempName;
      await this.songSheetService.update(this.sheet);
    }
    this.renaming = false;
  }

  cancelRename() {
    this.renaming = false;
    this.tempName = '';
  }

  showTuning() {
    if (this.sheet) {
      this.tempTuning = [...this.sheet.tuning];
      this.tempCapodaster = this.sheet.capodaster;
      this.tempTempo = this.sheet.tempo;
      this.showTuningForm = true;
    }
  }

  async saveTuning() {
    if (this.sheet) {
      this.sheet.tuning = [...this.tempTuning];
      this.sheet.capodaster = this.tempCapodaster;
      this.sheet.tempo = this.tempTempo;
      await this.songSheetService.update(this.sheet);
    }
    this.showTuningForm = false;
  }

  cancelTuning() {
    this.showTuningForm = false;
  }

  async removeGrip(gripId: string) {
    if (this.sheet) {
      await this.songSheetService.removeGrip(this.sheet.id, gripId);
      this.sheet = await this.songSheetService.getByIdWithData(this.sheet.id);
    }
  }

  // Angular CDK drag and drop handler
  async dropGrip(event: CdkDragDrop<SongSheetGripWithData[]>) {
    if (!this.sheet) return;

    if (event.previousIndex !== event.currentIndex) {
      // Use CDK's moveItemInArray for local state update
      moveItemInArray(this.sheet.grips, event.previousIndex, event.currentIndex);

      // Persist the change to the service
      await this.songSheetService.moveGrip(this.sheet.id, event.previousIndex, event.currentIndex);

      // Refresh the sheet data
      this.sheet = await this.songSheetService.getByIdWithData(this.sheet.id);
    }
  }

  async dropPattern(event: CdkDragDrop<SongSheetPatternWithData[]>) {
    if (!this.sheet) return;

    if (event.previousIndex !== event.currentIndex) {
      moveItemInArray(this.sheet.patterns, event.previousIndex, event.currentIndex);
      await this.songSheetService.movePattern(this.sheet.id, event.previousIndex, event.currentIndex);
      this.sheet = await this.songSheetService.getByIdWithData(this.sheet.id);
    }
  }

  async dropPart(event: CdkDragDrop<SongPart[]>) {
    if (!this.sheet) return;

    if (event.previousIndex !== event.currentIndex) {
      moveItemInArray(this.sheet.parts, event.previousIndex, event.currentIndex);
      await this.songSheetService.movePart(this.sheet.id, event.previousIndex, event.currentIndex);
      this.sheet = await this.songSheetService.getByIdWithData(this.sheet.id);
    }
  }

  async removePattern(patternId: string) {
    if (this.sheet) {
      await this.songSheetService.removePattern(this.sheet.id, patternId);
      const updated = await this.songSheetService.getById(this.sheet.id);
      if (updated) {
        this.sheet = await this.songSheetService.getByIdWithData(this.sheet.id);
      }
    }
  }

  async playGrip(grip: SongSheetGripWithData) {
    if (!this.sheet || !grip.grip) return;

    try {
      const tuning = this.sheet.tuning.map(note => transpose(note, this.sheet!.capodaster));
      const tunedGrip = this.gripService.toTunedGrip(grip.grip, tuning);
      const notes: string[] = tunedGrip.notes.filter((note): note is string => note !== null);

      if (notes.length > 0) {
        await this.playback.playChordFromNotes(notes);
      } else {
        console.warn('No playable notes found in grip');
      }
    } catch (error) {
      console.error('Error playing grip:', error);
    }
  }

  async playPattern(pattern: SongSheetPatternWithData) {
    if (!this.sheet || !pattern.pattern) return;

    try {
      const tuning = this.sheet.tuning.map(note => transpose(note, this.sheet!.capodaster));
      await this.playback.playRhythmPattern(pattern.pattern, tuning, undefined, this.sheet.tempo);
    } catch (error) {
      console.error('Error playing rhythm pattern:', error);
    }
  }

  // Song parts management
  showAddPart() {
    this.showAddPartForm = true;
    this.resetPartForm();
  }

  startEditingPart(partIndex: number) {
    if (!this.sheet || !this.sheet.parts) return;

    const part = this.sheet.parts[partIndex];
    this.editingPartIndex = partIndex;
    this.tempPartSection = part.section;
    this.tempPartPatterns = part.patterns.map(p => ({
      pattern: { patternId: p.pattern.patternId },
      grips: p.grips.map(g => ({
        grip: { gripId: g.grip.gripId, chordName: g.grip.chordName },
        startAction: g.startAction
      }))
    }));
  }

  async savePartEdit() {
    if (!this.sheet || this.editingPartIndex === null) return;

    const part: SongPart = {
      section: this.tempPartSection,
      patterns: this.tempPartPatterns
    };

    await this.songSheetService.updatePart(this.sheet.id, this.editingPartIndex, part);
    this.cancelPartEdit();
    await this.refreshData();
  }

  async addNewPart() {
    if (!this.sheet || !this.tempPartSection.trim()) return;

    const part: SongPart = {
      section: this.tempPartSection.trim(),
      patterns: this.tempPartPatterns
    };

    await this.songSheetService.addPart(this.sheet.id, part);
    this.cancelPartEdit();
    await this.refreshData();
  }

  async removePart(partIndex: number) {
    if (!this.sheet) return;

    const confirmed = await this.dialogService.confirm(
      'Are you sure you want to remove this song part?',
      'Remove Song Part',
      'Remove',
      'Cancel',
      { variant: 'danger' }
    );

    if (confirmed) {
      await this.songSheetService.removePart(this.sheet.id, partIndex);
      await this.refreshData();
    }
  }

  cancelPartEdit() {
    this.editingPartIndex = null;
    this.showAddPartForm = false;
    this.resetPartForm();
  }

  private resetPartForm() {
    this.tempPartSection = '';
    this.tempPartPatterns = [];
  }

  addPatternToPart() {
    this.tempPartPatterns.push({
      pattern: { patternId: '' },
      grips: []
    });
  }

  removePatternFromPart(index: number) {
    this.tempPartPatterns.splice(index, 1);
  }

  addGripToPattern(patternIndex: number) {
    this.tempPartPatterns[patternIndex].grips.push({
      grip: { gripId: '', chordName: '' },
      startAction: 1
    });
  }

  removeGripFromPattern(patternIndex: number, gripIndex: number) {
    this.tempPartPatterns[patternIndex].grips.splice(gripIndex, 1);
  }

  updateGripChordName(patternIndex: number, gripIndex: number, gripId: string) {
    if (!this.sheet) return;
    const grip = this.sheet.grips.find(g => g.gripId === gripId);
    if (grip) {
      this.tempPartPatterns[patternIndex].grips[gripIndex].grip.chordName = grip.chordName;
    }
  }

  private async refreshData() {
    if (!this.sheet) return;
    this.sheet = await this.songSheetService.getByIdWithData(this.sheet.id);
  }

  getPatternName(patternId: string): string {
    if (!this.sheet) return 'Unknown Pattern';
    const pattern = this.sheet.patterns.find(p => p.patternId === patternId);
    return pattern?.pattern?.name || 'Unknown Pattern';
  }

  getTuningDisplay(): string {
    if (!this.sheet) return '';
    return this.sheet.tuning.map(note => `${note.semitone}${note.octave}`).join(' | ');
  }

  async addGrip(chordName?: string) {
    if (this.sheet) {
      if (chordName) {
        await this.openGripSelector(chordName);
      } else {
        await this.openGripSelector();
      }
    }
  }

  private async openGripSelector(chord?: Chord | string) {
    const data: GripSelectorModalData = {
      chord
    }

    const modalRef = this.modalService.show(GripSelectorModalComponent, {
      data,
      width: '95vw',
      height: '90vh',
      maxHeight: '90vh',
      panelClass: 'modal-xl',
      closeOnBackdropClick: true
    });

    // Wait for the modal to close
    const result = await modalRef.afterClosed();

    if (result) {
      const songSheetGrips = result.grips.map((grip: TunedGrip): SongSheetGrip => {
        return {
          gripId: stringifyGrip(grip),
          chordName: chordToString(result.chord)
        }
      });

      if (this.sheet) {
        const sheet = this.sheet;
        await this.songSheetService.addGrips(songSheetGrips, sheet.id);
        this.sheet = await this.songSheetService.getByIdWithData(sheet.id);
      }
    }
  }

  async addPatterns() {
    if (!this.sheet) {
      return;
    }

    const choice = await this.openChoiceDialog(this.patternSourceChoices);

    if (choice === 'from-library') {
      await this.openPatternLibrary();
      return;
    }

    if (choice === 'create-new') {
      await this.openPatternEditorAndAddToSheet();
    }
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
        width: '380px',
        maxWidth: '95vw',
        closeOnBackdropClick: true
      }
    );

    return modalRef.afterClosed();
  }

  private async openPatternLibrary() {
    const modalRef = this.modalService.show(PatternLibrarySelectorModalComponent, {
      width: '95vw',
      height: '90vh',
      maxHeight: '90vh',
      panelClass: 'modal-xl',
      closeOnBackdropClick: false
    });

    // Wait for the modal to close
    const result = await modalRef.afterClosed();

    if (result) {
      const songSheetPatterns = result.patterns.map((pattern: RhythmPattern): SongSheetPattern => {
        return {
          patternId: pattern.id,
        }
      });

      if (this.sheet) {
        const sheet = this.sheet;
        await this.songSheetService.addPatterns(songSheetPatterns, sheet.id);
        this.sheet = await this.songSheetService.getByIdWithData(sheet.id);
      }
    }
  }

  private async openPatternEditorAndAddToSheet() {
    if (!this.sheet) {
      return;
    }

    const createdPattern = this.createEmptyPattern();
    const result = await this.openPatternEditor(createdPattern);

    if (!result) {
      return;
    }

    await this.rhythmPatternsService.add(result);
    await this.songSheetService.addPattern({ patternId: result.id }, this.sheet.id);
    this.sheet = await this.songSheetService.getByIdWithData(this.sheet.id);
  }

  private createEmptyPattern(): RhythmPattern {
    const now = Date.now();

    return {
      id: now.toString(),
      name: '',
      description: '',
      category: '',
      measures: [{
        timeSignature: '4/4',
        actions: Array(16).fill(null)
      }],
      createdAt: now,
      updatedAt: now,
      isCustom: true
    };
  }

  private async openPatternEditor(pattern: RhythmPattern): Promise<RhythmPattern | undefined> {
    const modalRef = this.modalService.show(RhythmPatternEditorModalComponent, {
      width: '95vw',
      height: '90vh',
      maxHeight: '90vh',
      panelClass: 'modal-xl',
      closeOnBackdropClick: false
    });

    // Set the pattern on the component instance
    if (modalRef.componentInstance) {
      modalRef.componentInstance.pattern = pattern;
    }

    // Wait for the modal to close
    const result = await modalRef.afterClosed();

    return result;
  }
}
