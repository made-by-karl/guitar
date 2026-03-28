import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {MODAL_REF, ModalRef, MODAL_DATA, ModalComponent} from '@/app/core/services/modal.service';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'primary' | 'danger' | 'warning' | 'success';
  type?: 'confirm' | 'alert';
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirm-dialog.component.html',
  styleUrls: ['./confirm-dialog.component.scss']
})
export class ConfirmDialogComponent implements ModalComponent<boolean> {
  constructor(
    @Inject(MODAL_REF) public modalRef: ModalRef<boolean>,
    @Inject(MODAL_DATA) public data: ConfirmDialogData
  ) {}

  onConfirm() {
    this.modalRef.close(true);
  }

  onCancel() {
    this.modalRef.close(false);
  }
}
