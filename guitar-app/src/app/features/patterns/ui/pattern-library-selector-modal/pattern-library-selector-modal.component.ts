import {Component, Inject, Optional} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {RouterModule} from '@angular/router';
import {MODAL_DATA, MODAL_REF, ModalComponent, ModalDataComponent, ModalRef} from '@/app/core/services/modal.service';
import { SelectionMode } from '@/app/core/ui/selection-mode';
import {
  PatternSelectorResult,
  PatternsLibrarySelectorComponent
} from '@/app/features/patterns/ui/patterns-library-selector/patterns-library-selector.component';

export interface PatternLibrarySelectorModalData { selectionMode?: SelectionMode; }

@Component({
  selector: 'app-pattern-library-selector-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, PatternsLibrarySelectorComponent],
  templateUrl: './pattern-library-selector-modal.component.html',
  styleUrls: ['./pattern-library-selector-modal.component.scss']
})
export class PatternLibrarySelectorModalComponent implements ModalComponent<PatternSelectorResult>, ModalDataComponent<PatternLibrarySelectorModalData> {
  selectedPatterns: PatternSelectorResult | undefined = undefined;
  readonly data: PatternLibrarySelectorModalData;

  constructor(
    @Inject(MODAL_REF) public modalRef: ModalRef<PatternSelectorResult>,
    @Optional() @Inject(MODAL_DATA) data: PatternLibrarySelectorModalData | null
  ) {
    this.data = data ?? {};
  }

  get canApply(): boolean {
    const count = this.selectedPatterns?.patterns.length ?? 0;
    return this.selectionMode === 'single' ? count === 1 : count > 0;
  }

  get selectionMode(): SelectionMode { return this.data.selectionMode ?? 'multiple'; }

  onSelectionChange(selectedPatterns: PatternSelectorResult) {
    this.selectedPatterns = selectedPatterns;
  }

  onSave() {
    if (!this.canApply) return;

    this.modalRef.close(this.selectedPatterns);
  }

  onCancel() {
    this.modalRef.close(undefined);
  }
}
