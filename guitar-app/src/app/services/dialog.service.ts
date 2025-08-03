import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

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

export interface DialogResult {
  confirmed: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class DialogService {
  private dialogSubject = new Subject<DialogConfig>();
  private resultSubject = new Subject<DialogResult>();

  dialog$ = this.dialogSubject.asObservable();
  result$ = this.resultSubject.asObservable();

  confirm(
    message: string, 
    title: string = 'Confirm', 
    confirmText: string = 'OK', 
    cancelText: string = 'Cancel',
    options?: {
      variant?: DialogVariant;
    }
  ): Promise<boolean> {
    const config: DialogConfig = {
      title,
      message,
      type: 'confirm',
      variant: options?.variant ?? 'primary',
      confirmText,
      cancelText
    };

    this.dialogSubject.next(config);

    return new Promise<boolean>((resolve) => {
      const subscription = this.result$.subscribe((result) => {
        subscription.unsubscribe();
        resolve(result.confirmed);
      });
    });
  }

  alert(
    message: string, 
    title: string = 'Information', 
    confirmText: string = 'OK',
    options?: {
      variant?: DialogVariant;
    }
  ): Promise<void> {
    const config: DialogConfig = {
      title,
      message,
      type: 'alert',
      variant: options?.variant ?? 'primary',
      confirmText
    };

    this.dialogSubject.next(config);

    return new Promise<void>((resolve) => {
      const subscription = this.result$.subscribe(() => {
        subscription.unsubscribe();
        resolve();
      });
    });
  }

  close(confirmed: boolean = false) {
    this.resultSubject.next({ confirmed });
  }
}
