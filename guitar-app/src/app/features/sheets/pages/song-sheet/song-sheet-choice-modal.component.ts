import { A11yModule } from '@angular/cdk/a11y';
import { CommonModule } from '@angular/common';
import { Component, Inject, HostListener } from '@angular/core';
import { MODAL_DATA, MODAL_REF, ModalComponent, ModalDataComponent, ModalRef } from '@/app/core/services/modal.service';

export interface SongSheetChoice {
  value: string;
  text: string;
}

export interface SongSheetChoiceModalData {
  title: string;
  choices: SongSheetChoice[];
}

@Component({
  selector: 'app-song-sheet-choice-modal',
  standalone: true,
  imports: [CommonModule, A11yModule],
  styleUrl: './song-sheet-choice-modal.component.scss',
  template: `
    <div class="modal-content-wrapper" role="dialog" aria-modal="true" aria-labelledby="choice-title" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
      <div class="modal-body p-3">
        <h5 id="choice-title" class="modal-title mb-3">{{ data.title }}</h5>
        <div class="d-grid gap-2">
          @for (choice of data.choices; track choice.value) {
            <button class="btn btn-outline-primary text-start" type="button" (click)="modalRef.close(choice.value)">
              {{ choice.text }}
            </button>
          }
        </div>
      </div>
      <div class="p-3 border-top text-end"><button class="btn btn-secondary" type="button" cdkFocusInitial (click)="modalRef.close()">Cancel</button></div>
    </div>
  `
})
export class SongSheetChoiceModalComponent implements ModalComponent<string>, ModalDataComponent<SongSheetChoiceModalData> {
  @HostListener('keydown.escape', ['$event']) dismiss(event: Event): void { event.stopPropagation(); this.modalRef.close(); }
  constructor(
    @Inject(MODAL_REF) public modalRef: ModalRef<string>,
    @Inject(MODAL_DATA) public data: SongSheetChoiceModalData
  ) {}
}
