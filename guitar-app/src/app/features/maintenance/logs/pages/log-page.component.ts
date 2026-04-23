import { Component, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogService } from '@/app/core/services/dialog.service';
import { ConsoleLogStoreService, ConsoleLogEntry } from '@/app/core/services/console-log-store.service';
import { NotificationService } from '@/app/core/services/notification.service';

@Component({
  selector: 'app-log-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container py-4">
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <div>
          <h2 class="mb-1"><i class="bi bi-journal-text me-2"></i>Application Logs</h2>
          <p class="text-muted mb-0">Showing {{ displayedEntries().length }} entries (max 2000).</p>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-outline-secondary" type="button" (click)="copyAll()">
            <i class="bi bi-clipboard me-1"></i>Copy All
          </button>
          <button class="btn btn-danger" type="button" (click)="clear()">
            <i class="bi bi-trash me-1"></i>Clear
          </button>
        </div>
      </div>

      @if (displayedEntries().length === 0) {
        <div class="alert alert-light border">
          No logs captured yet.
        </div>
      } @else {
        <div class="card">
          <div class="card-body log-list p-0">
            @for (entry of displayedEntries(); track entry.id) {
              <div class="log-entry p-2 border-bottom">
                <div class="d-flex align-items-center gap-2 mb-1">
                  <span class="badge text-uppercase" [class]="badgeClass(entry.level)">{{ entry.level }}</span>
                  <code class="small text-muted">{{ entry.timestamp }}</code>
                </div>
                <pre class="mb-0 log-message">{{ entry.messageText }}</pre>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .log-list {
      max-height: 70vh;
      overflow: auto;
    }

    .log-entry:last-child {
      border-bottom: none !important;
    }

    .log-message {
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 0.85rem;
      line-height: 1.3;
    }

    .badge.bg-log {
      background-color: #6c757d;
    }

    .badge.bg-info {
      background-color: #0d6efd;
    }

    .badge.bg-warn {
      background-color: #fd7e14;
    }

    .badge.bg-error {
      background-color: #dc3545;
    }

    .badge.bg-debug {
      background-color: #198754;
    }

    .badge.bg-trace {
      background-color: #6f42c1;
    }
  `]
})
export class LogPageComponent {
  readonly displayedEntries = computed(() => [...this.consoleLogStore.entries()].reverse());

  constructor(
    private consoleLogStore: ConsoleLogStoreService,
    private dialogService: DialogService,
    private notificationService: NotificationService
  ) {}

  async clear(): Promise<void> {
    const confirmed = await this.dialogService.confirm(
      'Delete all captured log entries?',
      'Clear Logs',
      'Clear',
      'Cancel',
      { variant: 'danger' }
    );

    if (confirmed) {
      this.consoleLogStore.clear();
    }
  }

  async copyAll(): Promise<void> {
    if (!navigator.clipboard?.writeText) {
      await this.dialogService.alert(
        'Clipboard API is not available in this browser.',
        'Copy Failed',
        'OK',
        { variant: 'warning' }
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(this.consoleLogStore.exportJson());
      this.notificationService.success('Copied logs to clipboard');
    } catch (error) {
      console.error('Failed to copy logs:', error);
      await this.dialogService.alert(
        'Could not copy logs to clipboard.',
        'Copy Failed',
        'OK',
        { variant: 'danger' }
      );
    }
  }

  badgeClass(level: ConsoleLogEntry['level']): string {
    switch (level) {
      case 'info':
        return 'bg-info';
      case 'warn':
        return 'bg-warn';
      case 'error':
        return 'bg-error';
      case 'debug':
        return 'bg-debug';
      case 'trace':
        return 'bg-trace';
      default:
        return 'bg-log';
    }
  }
}
