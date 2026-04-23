import { Injectable, signal } from '@angular/core';

export type NotificationVariant = 'info' | 'success' | 'danger';

export interface AppNotification {
  id: number;
  message: string;
  variant: NotificationVariant;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  readonly notification = signal<AppNotification | null>(null);

  private nextNotificationId = 0;
  private hideTimeout?: ReturnType<typeof setTimeout>;

  show(
    message: string,
    options?: {
      variant?: NotificationVariant;
      durationMs?: number;
    }
  ): void {
    this.clearHideTimeout();

    const notification: AppNotification = {
      id: ++this.nextNotificationId,
      message,
      variant: options?.variant ?? 'info'
    };

    this.notification.set(notification);

    const durationMs = options?.durationMs ?? 2200;
    this.hideTimeout = setTimeout(() => {
      if (this.notification()?.id === notification.id) {
        this.notification.set(null);
      }
    }, durationMs);
  }

  info(message: string, durationMs?: number): void {
    this.show(message, { variant: 'info', durationMs });
  }

  success(message: string, durationMs?: number): void {
    this.show(message, { variant: 'success', durationMs });
  }

  error(message: string, durationMs?: number): void {
    this.show(message, { variant: 'danger', durationMs: durationMs ?? 3200 });
  }

  dismiss(): void {
    this.clearHideTimeout();
    this.notification.set(null);
  }

  private clearHideTimeout(): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = undefined;
    }
  }
}
