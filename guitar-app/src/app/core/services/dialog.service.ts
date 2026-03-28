import { Injectable } from '@angular/core';
import { ModalService } from '@/app/core/services/modal.service';
import { ConfirmDialogComponent, ConfirmDialogData } from '@/app/core/ui/confirm-dialog/confirm-dialog.component';

export type DialogType = 'confirm' | 'alert';
export type DialogVariant = 'primary' | 'danger' | 'warning' | 'success';

export interface DialogConfig {
  title: string;
  message: string;
  type: DialogType;
  variant: DialogVariant;
  confirmText?: string;
  cancelText?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DialogService {
  constructor(private modalService: ModalService) {}

  async confirm(
    message: string,
    title: string = 'Confirm',
    confirmText: string = 'OK',
    cancelText: string = 'Cancel',
    options?: {
      variant?: DialogVariant;
    }
  ): Promise<boolean> {
    const data: ConfirmDialogData = {
      title,
      message,
      type: 'confirm',
      variant: options?.variant ?? 'primary',
      confirmText,
      cancelText
    };

    const modalRef = this.modalService.show(ConfirmDialogComponent, {
      data,
      width: 'auto',
      closeOnBackdropClick: false
    });

    return await modalRef.afterClosed();
  }

  async alert(
    message: string,
    title: string = 'Information',
    confirmText: string = 'OK',
    options?: {
      variant?: DialogVariant;
    }
  ): Promise<void> {
    const data: ConfirmDialogData = {
      title,
      message,
      type: 'alert',
      variant: options?.variant ?? 'primary',
      confirmText
    };

    const modalRef = this.modalService.show(ConfirmDialogComponent, {
      data,
      width: 'auto',
      closeOnBackdropClick: false
    });

    await modalRef.afterClosed();
  }
}
