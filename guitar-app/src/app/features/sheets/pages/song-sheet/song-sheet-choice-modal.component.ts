import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
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
  imports: [CommonModule],
  template: `
    <div class="modal-content-wrapper">
      <div class="modal-body p-3">
        <h5 class="modal-title mb-3">{{ data.title }}</h5>
        <div class="d-grid gap-2">
          @for (choice of data.choices; track choice.value) {
            <button class="btn btn-outline-primary text-start" type="button" (click)="modalRef.close(choice.value)">
              {{ choice.text }}
            </button>
          }
        </div>
      </div>
    </div>
  `
})
export class SongSheetChoiceModalComponent implements ModalComponent<string>, ModalDataComponent<SongSheetChoiceModalData> {
  constructor(
    @Inject(MODAL_REF) public modalRef: ModalRef<string>,
    @Inject(MODAL_DATA) public data: SongSheetChoiceModalData
  ) {}
}
