import {Component, Inject} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {RouterModule} from '@angular/router';
import {MODAL_REF, ModalComponent, ModalRef} from '@/app/core/services/modal.service';
import {
  PatternSelectorResult,
  PatternsLibrarySelectorComponent
} from '@/app/features/patterns/ui/patterns-library-selector/patterns-library-selector.component';

@Component({
  selector: 'app-pattern-library-selector-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, PatternsLibrarySelectorComponent],
  templateUrl: './pattern-library-selector-modal.component.html',
  styleUrls: ['./pattern-library-selector-modal.component.scss']
})
export class PatternLibrarySelectorModalComponent implements ModalComponent<PatternSelectorResult> {
  selectedPatterns: PatternSelectorResult | undefined = undefined;

  constructor(
    @Inject(MODAL_REF) public modalRef: ModalRef<PatternSelectorResult>
  ) {
  }

  get canApply(): boolean {
    return (!!this.selectedPatterns) && this.selectedPatterns.patterns.length > 0;
  }

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
