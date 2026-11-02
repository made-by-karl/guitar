import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MODAL_DATA, MODAL_REF, ModalComponent, ModalDataComponent, ModalRef } from '@/app/core/services/modal.service';

export interface SongPartNotesData { notes: string; readOnly: boolean; }

@Component({
  selector: 'app-song-part-notes-modal',
  imports: [FormsModule],
  template: `
    <div class="modal-header"><h5 class="modal-title">Notes</h5><button class="btn-close" type="button" aria-label="Close notes" (click)="modalRef.close()"></button></div>
    <div class="modal-body">
      @if (data.readOnly) { <p class="small text-muted">Unlock Music to edit these notes.</p> }
      <label for="partNotes" class="form-label">Notes</label>
      <textarea id="partNotes" class="form-control" rows="8" [(ngModel)]="notes" [readOnly]="data.readOnly" placeholder="Cues, dynamics, picking notes…"></textarea>
    </div>
    <div class="modal-footer"><button class="btn btn-outline-secondary" type="button" (click)="modalRef.close()">Close</button>
      @if (!data.readOnly) { <button class="btn btn-primary" type="button" (click)="modalRef.close(notes)">Apply notes</button> }
    </div>`
})
export class SongPartNotesModalComponent implements ModalComponent<string | undefined>, ModalDataComponent<SongPartNotesData> {
  notes: string;
  constructor(@Inject(MODAL_REF) public modalRef: ModalRef<string | undefined>, @Inject(MODAL_DATA) public data: SongPartNotesData) {
    this.notes = data.notes;
  }
}
