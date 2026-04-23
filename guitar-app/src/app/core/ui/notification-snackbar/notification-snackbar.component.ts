import { Component, inject } from '@angular/core';
import { NotificationService } from '@/app/core/services/notification.service';

@Component({
  selector: 'app-notification-snackbar',
  standalone: true,
  templateUrl: './notification-snackbar.component.html',
  styleUrl: './notification-snackbar.component.scss'
})
export class NotificationSnackbarComponent {
  protected readonly notificationService = inject(NotificationService);
}
