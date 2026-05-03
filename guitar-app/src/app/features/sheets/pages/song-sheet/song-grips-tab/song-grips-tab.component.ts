import { Component, inject, input, output } from '@angular/core';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { PlaybackService } from '@/app/core/services/playback.service';
import { ModalService } from '@/app/core/services/modal.service';
import { transpose } from '@/app/core/music/semitones';
import { chordToString } from '@/app/core/music/chords';
import { GripDiagramComponent } from '@/app/core/ui/grip-diagram/grip-diagram.component';
import { GripService } from '@/app/features/grips/services/grips/grip.service';
import { serializeGrip, TunedGrip } from '@/app/features/grips/services/grips/grip.model';
import { GripSelectorModalComponent, GripSelectorModalData } from '@/app/features/grips/ui/grip-selector-modal/grip-selector-modal.component';
import { SongSheetGrip, SongSheetGripWithData, SongSheetWithData } from '@/app/features/sheets/services/song-sheets.model';
import { SongSheetsService } from '@/app/features/sheets/services/song-sheets.service';
import {
  CustomGripEditorModalComponent,
  CustomGripEditorResult
} from '@/app/features/grips/ui/custom-grip-editor-modal/custom-grip-editor-modal.component';
import {
  GripSourceSelectorModalComponent,
  GripSourceSelectorResult
} from '@/app/features/grips/ui/grip-source-selector-modal/grip-source-selector-modal.component';

@Component({
  selector: 'app-song-sheet-grips-tab',
  standalone: true,
  imports: [DragDropModule, GripDiagramComponent],
  templateUrl: './song-grips-tab.component.html',
  styleUrl: './song-grips-tab.component.scss'
})
export class SongGripsTabComponent {
  readonly sheet = input.required<SongSheetWithData>();
  readonly changed = output<void>();

  private readonly songSheetService = inject(SongSheetsService);
  private readonly playback = inject(PlaybackService);
  private readonly gripService = inject(GripService);
  private readonly modalService = inject(ModalService);

  async addGrip(name?: string): Promise<void> {
    const added = await this.openAddGripFlow(name);
    if (added) {
      this.changed.emit();
    }
  }

  async playGrip(grip: SongSheetGripWithData): Promise<void> {
    if (!grip.grip) {
      return;
    }

    try {
      const tuning = this.sheet().tuning.map(note => transpose(note, this.sheet().capodaster));
      const tunedGrip = this.gripService.toTunedGrip(grip.grip, tuning);
      const notes = tunedGrip.notes.filter((note): note is string => note !== null);

      if (notes.length > 0) {
        await this.playback.playChordFromNotes(notes);
      }
    } catch (error) {
      console.error('Error playing grip:', error);
    }
  }

  async removeGrip(gripId: string): Promise<void> {
    await this.songSheetService.removeGrip(this.sheet().id, gripId);
    this.changed.emit();
  }

  async dropGrip(event: CdkDragDrop<SongSheetGripWithData[]>): Promise<void> {
    if (event.previousIndex === event.currentIndex) {
      return;
    }

    moveItemInArray(this.sheet().grips, event.previousIndex, event.currentIndex);
    await this.songSheetService.moveGrip(this.sheet().id, event.previousIndex, event.currentIndex);
    this.changed.emit();
  }

  private async openAddGripFlow(name?: string): Promise<boolean> {
    const source = await this.openGripSourceSelector();
    if (!source || source.kind === 'cancel' || source.kind === 'clear') {
      return false;
    }

    if (source.kind === 'custom') {
      return this.openCustomGripEditor(name);
    }

    return this.openGripSelector();
  }

  private async openGripSelector(): Promise<boolean> {
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
      return false;
    }

    const songSheetGrips = result.grips.map((grip: TunedGrip): SongSheetGrip => ({
      gripId: serializeGrip(grip),
      name: chordToString(result.chord)
    }));

    await this.songSheetService.addGrips(songSheetGrips, this.sheet().id);
    return true;
  }

  private async openCustomGripEditor(name?: string): Promise<boolean> {
    const modalRef = this.modalService.show(CustomGripEditorModalComponent, {
      data: {
        title: 'Create Custom Grip',
        submitLabel: 'Save Grip',
        initialName: name
      },
      width: '95vw',
      maxWidth: '720px',
      maxHeight: '90vh',
      closeOnBackdropClick: true
    });

    const result = await modalRef.afterClosed();
    if (!result) {
      return false;
    }

    await this.songSheetService.addGrip(this.toSongSheetGrip(result), this.sheet().id);
    return true;
  }

  private async openGripSourceSelector(): Promise<GripSourceSelectorResult | undefined> {
    const modalRef = this.modalService.show(GripSourceSelectorModalComponent, {
      data: {
        title: 'Add Grip',
        allowSavedGripSelection: false,
        allowClear: false
      },
      width: '420px',
      maxWidth: '95vw',
      closeOnBackdropClick: true
    });

    return modalRef.afterClosed();
  }

  private toSongSheetGrip(result: CustomGripEditorResult): SongSheetGrip {
    return {
      gripId: serializeGrip(result.grip),
      name: result.name
    };
  }
}
