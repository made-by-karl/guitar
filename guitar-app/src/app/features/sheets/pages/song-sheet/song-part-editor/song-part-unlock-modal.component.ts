import { Component, Inject } from '@angular/core';
import { MODAL_DATA, MODAL_REF, ModalComponent, ModalDataComponent, ModalRef } from '@/app/core/services/modal.service';

export type UnlockPartResult = 'unlock' | 'independent';
export interface UnlockPartData { count: number; canMakeIndependent: boolean; }

@Component({
  selector: 'app-song-part-unlock-modal',
  template: `
    <div class="modal-header"><h5 class="modal-title">Edit this music?</h5><button class="btn-close" type="button" aria-label="Keep music locked" (click)="modalRef.close()"></button></div>
    <div class="modal-body">
      <p>This music and its notes are used by {{ data.count }} occurrences. Editing them updates every occurrence.</p>
      <p class="small text-muted">Editing locks again when you switch occurrences or leave this editor.</p>
      <div class="d-grid gap-2">
        <button class="btn btn-primary" type="button" (click)="modalRef.close('unlock')">Edit all {{ data.count }} occurrences</button>
        @if (data.canMakeIndependent) { <button class="btn btn-outline-primary" type="button" (click)="modalRef.close('independent')">Make this occurrence independent</button> }
        <button class="btn btn-outline-secondary" type="button" (click)="modalRef.close()">Keep locked</button>
      </div>
    </div>`
})
export class SongPartUnlockModalComponent implements ModalComponent<UnlockPartResult | undefined>, ModalDataComponent<UnlockPartData> {
  constructor(@Inject(MODAL_REF) public modalRef: ModalRef<UnlockPartResult | undefined>, @Inject(MODAL_DATA) public data: UnlockPartData) {}
}
