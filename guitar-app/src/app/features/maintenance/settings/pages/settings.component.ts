import { CommonModule } from '@angular/common';
import { DataTransferService } from '@/app/core/services/data-transfer.service';
import { JsonImportComponent } from '@/app/core/ui/json-import/json-import.component';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogService } from '@/app/core/services/dialog.service';
import { DatabaseService } from '@/app/core/services/database.service';
import { DebugSettingsService } from '@/app/core/services/debug-settings.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, JsonImportComponent],
  template: `
    <div class="container app-page">
      <h2 class="mb-4"><i class="bi bi-gear me-2"></i>Settings</h2>

      <div class="card mb-4">
        <div class="card-header">
          <h5 class="mb-0"><i class="bi bi-database me-2"></i>Data Management</h5>
        </div>
        <div class="card-body">
          <p>Back up all saved song sheets and stored global patterns, including built-in and custom patterns.</p>
          <p class="small text-muted">Backups exclude device debug settings, update history, diagnostics, permissions, audio caches, unsaved drafts, and live playback.</p>
          <p role="status">{{ lastBackup ? 'Last backup download initiated: ' : 'No backup yet' }}@if (lastBackup) { {{ lastBackup | date:'medium' }} }</p>
          <button type="button" class="btn btn-primary mb-2" [disabled]="downloading" (click)="downloadBackup()">{{ downloading ? 'Preparing backup…' : 'Download backup' }}</button>
          <p class="small text-muted">The date records download handoff on this browser. Keep the downloaded file somewhere safe.</p>
          @if (backupError) { <p class="alert alert-danger" role="alert">{{ backupError }}</p> }
          <app-json-import kind="guitar-backup" />
          <hr>
          <button class="btn btn-warning me-2" (click)="clearData()">
            <i class="bi bi-trash me-1"></i>Clear Practice Data
          </button>
          <p><small class="text-muted">This will remove all song sheets and playing patterns stored on this browser.</small></p>
        </div>
      </div>

      <div class="card mb-4">
        <div class="card-header">
          <h5 class="mb-0"><i class="bi bi-bug me-2"></i>Developer Tools</h5>
        </div>
        <div class="card-body">
          <div class="form-check form-switch">
            <input
              id="tunerDebugEnabled"
              class="form-check-input"
              type="checkbox"
              [ngModel]="debugSettings.tunerDebugEnabled()"
              (ngModelChange)="setTunerDebugEnabled($event)">
            <label class="form-check-label" for="tunerDebugEnabled">
              Enable tuner debug mode
            </label>
          </div>
          <p class="text-muted mt-2 mb-0">
            Stores per-frame tuner diagnostics locally and enables debug export on the tuner page.
          </p>
        </div>
      </div>
    </div>
  `,
  styles: [``]
})
export class SettingsComponent {
  downloading = false;
  backupError = '';
  lastBackup?: number;

  constructor(
    private dialogService: DialogService,
    private db: DatabaseService,
    readonly debugSettings: DebugSettingsService,
    private readonly transfer: DataTransferService
  ) { this.lastBackup = transfer.lastBackupDownload(); }

  async downloadBackup(): Promise<void> {
    if (this.downloading) return;
    this.downloading = true; this.backupError = '';
    try {
      await this.transfer.downloadBackup();
      this.lastBackup = this.transfer.lastBackupDownload();
    } catch (error) { this.backupError = error instanceof Error ? error.message : 'Backup failed. Try again.'; }
    finally { this.downloading = false; }
  }

  setTunerDebugEnabled(enabled: boolean): void {
    this.debugSettings.setTunerDebugEnabled(enabled);
  }

  async clearData() {
    const confirmed = await this.dialogService.confirm(
      'Remove all song sheets and playing patterns on this browser? This action cannot be undone.',
      'Clear Practice Data',
      'Clear Data',
      'Cancel',
      { variant: 'danger' }
    );

    if (confirmed) {
      try {
        await this.db.restorePracticeData({ songSheets: [], playingPatterns: [] }, 'replace');
        await this.dialogService.alert(
          'All practice content has been cleared. Please refresh the page to see the changes.',
          'Data Cleared',
          undefined,
          { variant: 'success' }
        );
        window.location.reload();
      } catch (error) {
        console.error('Error clearing data:', error);
        await this.dialogService.alert(
          'An error occurred while clearing data. Please try again.',
          'Error',
          undefined,
          { variant: 'danger' }
        );
      }
    }
  }
}
