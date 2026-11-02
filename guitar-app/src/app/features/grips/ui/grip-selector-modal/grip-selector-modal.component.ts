import {Component, Inject} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {Chord} from '@/app/core/music/chords';
import {RouterModule} from '@angular/router';
import {MODAL_DATA, MODAL_REF, ModalComponent, ModalDataComponent, ModalRef} from '@/app/core/services/modal.service';
import {GripSelectorComponent, GripSelectorResult} from '@/app/features/grips/ui/grip-selector/grip-selector.component';
import {ChordService} from '@/app/features/grips/services/chords/chord.service';
import { SelectionMode } from '@/app/core/ui/selection-mode';

export interface GripSelectorModalData {
  chord?: Chord | string;
  selectionMode?: SelectionMode;
}

@Component({
  selector: 'app-grip-selector-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, GripSelectorComponent],
  templateUrl: './grip-selector-modal.component.html',
  styleUrls: ['./grip-selector-modal.component.scss']
})
export class GripSelectorModalComponent implements ModalComponent<GripSelectorResult>, ModalDataComponent<GripSelectorModalData> {
  selectedGrips: GripSelectorResult | undefined = undefined;

  chord: Chord | null = null

  constructor(
    @Inject(MODAL_REF) public modalRef: ModalRef<GripSelectorResult>,
    @Inject(MODAL_DATA) public data: GripSelectorModalData,
    chordService: ChordService,
  ) {
    if (data.chord === undefined) {
      this.chord = null;
    } else if (typeof data.chord === 'string') {
      this.chord = chordService.parseChord(data.chord);
    } else {
      this.chord = data.chord;
    }
  }

  get canApply(): boolean {
    const count = this.selectedGrips?.grips.length ?? 0;
    return this.selectionMode === 'single' ? count === 1 : count > 0;
  }

  get selectionMode(): SelectionMode { return this.data.selectionMode ?? 'multiple'; }

  onSelectionChange(selectedGrips: GripSelectorResult) {
    this.selectedGrips = selectedGrips;
  }

  onSave() {
    if (!this.canApply) return;

    this.modalRef.close(this.selectedGrips);
  }

  onCancel() {
    this.modalRef.close(undefined);
  }
}
