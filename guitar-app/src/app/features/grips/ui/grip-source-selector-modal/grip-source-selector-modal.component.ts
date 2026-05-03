import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import {
  MODAL_DATA,
  MODAL_REF,
  ModalComponent,
  ModalDataComponent,
  ModalRef
} from '@/app/core/services/modal.service';

export interface GripSourceSelectorSavedGrip {
  gripId: string;
  name: string;
}

export interface GripSourceSelectorModalData {
  title?: string;
  allowSavedGripSelection: boolean;
  allowClear: boolean;
  savedGrips?: GripSourceSelectorSavedGrip[];
}

export type GripSourceSelectorResult =
  | { kind: 'saved'; gripId: string }
  | { kind: 'from-chord' }
  | { kind: 'custom' }
  | { kind: 'clear' }
  | { kind: 'cancel' };

@Component({
  selector: 'app-grip-source-selector-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './grip-source-selector-modal.component.html',
  styleUrl: './grip-source-selector-modal.component.scss'
})
export class GripSourceSelectorModalComponent
  implements ModalComponent<GripSourceSelectorResult>, ModalDataComponent<GripSourceSelectorModalData> {
  constructor(
    @Inject(MODAL_REF) public modalRef: ModalRef<GripSourceSelectorResult>,
    @Inject(MODAL_DATA) public data: GripSourceSelectorModalData
  ) {}

  get title(): string {
    return this.data.title ?? 'Select Grip';
  }

  get savedGrips(): GripSourceSelectorSavedGrip[] {
    return this.data.savedGrips ?? [];
  }

  chooseSavedGrip(gripId: string): void {
    this.modalRef.close({ kind: 'saved', gripId });
  }

  chooseFromChord(): void {
    this.modalRef.close({ kind: 'from-chord' });
  }

  chooseCustom(): void {
    this.modalRef.close({ kind: 'custom' });
  }

  clear(): void {
    this.modalRef.close({ kind: 'clear' });
  }

  cancel(): void {
    this.modalRef.close({ kind: 'cancel' });
  }
}
