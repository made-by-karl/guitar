import { CommonModule } from '@angular/common';
import { Component, Inject, inject, OnDestroy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { chordToString } from '@/app/core/music/chords';
import { MODAL_DATA, MODAL_REF, ModalComponent, ModalDataComponent, ModalRef, ModalService } from '@/app/core/services/modal.service';
import { PlayingMeasureEditorComponent } from '@/app/features/patterns/ui/playing-measure-editor/playing-measure-editor.component';
import { Measure, PlayingPatternActionGrip } from '@/app/features/patterns/services/playing-patterns.model';
import { SongPart, SongPartActionGrip, SongSheetGrip, SongSheetWithData } from '@/app/features/sheets/services/song-sheets.model';
import { SongPartPlaybackService } from '@/app/features/sheets/services/song-part-playback.service';
import {
  CustomGripEditorModalComponent,
  CustomGripEditorResult
} from '@/app/features/grips/ui/custom-grip-editor-modal/custom-grip-editor-modal.component';
import {
  GripSourceSelectorModalComponent,
  GripSourceSelectorResult
} from '@/app/features/grips/ui/grip-source-selector-modal/grip-source-selector-modal.component';
import { GripSelectorModalComponent, GripSelectorModalData } from '@/app/features/grips/ui/grip-selector-modal/grip-selector-modal.component';
import { serializeGrip, TunedGrip } from '@/app/features/grips/services/grips/grip.model';
import { SongSheetsService } from '@/app/features/sheets/services/song-sheets.service';
import { cloneMeasure } from '../song-sheet.helpers';

export interface SongPartMeasureEditorModalData {
  sheet: SongSheetWithData;
  part: SongPart;
  measureId: string;
  occurrenceId?: string;
  measure: Measure;
  actionGrips: SongPartActionGrip[];
  measureLabel: string;
}

export interface SongPartMeasureEditorResult {
  measure: Measure;
  actionGrips: SongPartActionGrip[];
}

@Component({
  selector: 'app-song-part-measure-editor-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, PlayingMeasureEditorComponent],
  templateUrl: './song-part-measure-editor-modal.component.html',
  styleUrl: './song-part-measure-editor-modal.component.scss'
})
export class SongPartMeasureEditorModalComponent implements
  ModalComponent<SongPartMeasureEditorResult>,
  ModalDataComponent<SongPartMeasureEditorModalData>, OnDestroy {
  private readonly playback = inject(SongPartPlaybackService);
  private readonly playbackState = toSignal(this.playback.state$, { initialValue: this.playback.getSnapshot() });
  editedMeasure: Measure;
  editedActionGrips: PlayingPatternActionGrip[];
  sheet: SongSheetWithData;

  constructor(
    @Inject(MODAL_REF) public modalRef: ModalRef<SongPartMeasureEditorResult>,
    @Inject(MODAL_DATA) public data: SongPartMeasureEditorModalData,
    private readonly modalService: ModalService,
    private readonly songSheetService: SongSheetsService
  ) {
    this.sheet = this.data.sheet;
    this.editedMeasure = cloneMeasure(this.data.measure);
    this.editedActionGrips = this.data.actionGrips.map(grip => ({ ...grip, measureIndex: 0 }));
  }

  get isPlaying(): boolean {
    const state = this.playbackState();
    return state.type === 'measure' && state.status === 'playing'
      && state.partId === this.data.part.id && state.measureId === this.data.measureId && state.occurrenceId === this.data.occurrenceId;
  }

  get canPlay(): boolean {
    return this.playback.canPlayMeasure(this.sheet, this.buildPreviewPart(), this.data.measureId, this.data.occurrenceId);
  }

  async togglePlayback(): Promise<void> {
    await this.playback.toggleMeasurePreview(this.sheet, this.buildPreviewPart(), this.data.measureId, this.data.occurrenceId);
  }

  ngOnDestroy(): void {
    const state = this.playbackState();
    if (state.type === 'measure' && state.partId === this.data.part.id && state.measureId === this.data.measureId && state.occurrenceId === this.data.occurrenceId) {
      this.playback.stopMeasurePreview();
    }
  }

  private buildPreviewPart(): SongPart {
    return {
      ...this.data.part,
      measures: this.data.part.measures.map(partMeasure => partMeasure.id === this.data.measureId ? {
        ...partMeasure,
        measure: { ...this.editedMeasure, actionGrips: this.editedActionGrips }
      } : partMeasure)
    };
  }

  async assignActionGrip(actionIndex: number): Promise<void> {
    const effectiveGrip = this.editedActionGrips.find(grip => grip.actionIndex === actionIndex);
    const selectedGrip = await this.selectGrip(effectiveGrip?.name);
    if (selectedGrip === undefined) {
      return;
    }

    this.editedActionGrips = this.editedActionGrips.filter(grip => grip.actionIndex !== actionIndex);
    if (selectedGrip) {
      this.editedActionGrips = [
        ...this.editedActionGrips,
        {
          measureIndex: 0,
          actionIndex,
          gripId: selectedGrip.gripId,
          name: selectedGrip.name
        }
      ];
    }
  }

  save(): void {
    this.modalRef.close({
      measure: cloneMeasure(this.editedMeasure),
      actionGrips: this.editedActionGrips.map(grip => ({ ...grip, measureIndex: 0 }))
    });
  }

  cancel(): void {
    this.modalRef.close(undefined);
  }

  private async selectGrip(name?: string): Promise<SongSheetGrip | null | undefined> {
    const source = await this.openGripSourceSelector();
    if (!source || source.kind === 'cancel') {
      return undefined;
    }

    if (source.kind === 'clear') {
      return null;
    }

    if (source.kind === 'saved') {
      const selectedGrip = this.sheet.grips.find(grip => grip.gripId === source.gripId);
      return selectedGrip ? { gripId: selectedGrip.gripId, name: selectedGrip.name } : undefined;
    }

    if (source.kind === 'custom') {
      return this.openCustomGripEditor(name);
    }

    return this.openGripSelector();
  }

  private async openGripSourceSelector(): Promise<GripSourceSelectorResult | undefined> {
    const modalRef = this.modalService.show(GripSourceSelectorModalComponent, {
      data: {
        title: 'Select Grip',
        allowSavedGripSelection: this.sheet.grips.length > 0,
        allowClear: true,
        savedGrips: this.sheet.grips.map(grip => ({
          gripId: grip.gripId,
          name: grip.name
        }))
      },
      width: '420px',
      maxWidth: '95vw',
      closeOnBackdropClick: true
    });

    return modalRef.afterClosed();
  }

  private async openCustomGripEditor(name?: string): Promise<SongSheetGrip | undefined> {
    const modalRef = this.modalService.show(CustomGripEditorModalComponent, {
      data: {
        title: 'Create Custom Grip',
        submitLabel: 'Save Grip',
        initialName: name,
        tuning: this.sheet.tuning,
        capodaster: this.sheet.capodaster
      },
      width: '95vw',
      maxWidth: '720px',
      maxHeight: '90vh',
      closeOnBackdropClick: true
    });

    const result = await modalRef.afterClosed();
    if (!result) {
      return undefined;
    }

    const createdGrip = this.toSongSheetGrip(result);
    await this.songSheetService.addGrip(createdGrip, this.sheet.id);
    await this.refreshSheet();
    return this.sheet.grips.find(grip => grip.gripId === createdGrip.gripId) ?? createdGrip;
  }

  private async openGripSelector(): Promise<SongSheetGrip | undefined> {
    const data: GripSelectorModalData = {};
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
      name: chordToString(result.chord)
    }));

    await this.songSheetService.addGrips(songSheetGrips, this.sheet.id);
    await this.refreshSheet();
    return this.sheet.grips.find(grip => grip.gripId === songSheetGrips[0].gripId) ?? songSheetGrips[0];
  }

  private async refreshSheet(): Promise<void> {
    const sheet = await this.songSheetService.getByIdWithData(this.sheet.id);
    if (sheet) {
      this.sheet = sheet;
    }
  }

  private toSongSheetGrip(result: CustomGripEditorResult): SongSheetGrip {
    return {
      gripId: serializeGrip(result.grip),
      name: result.name
    };
  }
}
