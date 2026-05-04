import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MODAL_REF, ModalComponent, ModalRef } from '@/app/core/services/modal.service';

@Component({
  selector: 'app-debug-export-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './debug-export-dialog.component.html',
  styleUrl: './debug-export-dialog.component.scss'
})
export class DebugExportDialogComponent implements ModalComponent<string | null> {
  description = '';

  constructor(
    @Inject(MODAL_REF) public modalRef: ModalRef<string | null>
  ) {}

  confirm(): void {
    const trimmed = this.description.trim();
    this.modalRef.close(trimmed.length > 0 ? trimmed : null);
  }

  cancel(): void {
    this.modalRef.close(undefined);
  }
}
