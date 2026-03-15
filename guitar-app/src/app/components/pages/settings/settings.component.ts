import { Component } from '@angular/core';
import { DialogService } from '@/app/services/dialog.service';
import { DatabaseService } from '@/app/services/database.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  template: `
    <div class="container py-5">
      <h2 class="mb-4"><i class="bi bi-gear me-2"></i>Settings</h2>
      
      <div class="card mb-4">
        <div class="card-header">
          <h5 class="mb-0"><i class="bi bi-database me-2"></i>Data Management</h5>
        </div>
        <div class="card-body">
          <p class="text-muted">Manage your data storage</p>
          <button class="btn btn-warning me-2" (click)="clearData()">
            <i class="bi bi-trash me-1"></i>Clear All Data
          </button>
          <p><small class="text-muted">This will remove all song sheets, rhythm patterns, and settings.</small></p>
        </div>
      </div>
      
      <div class="alert alert-info">
        <i class="bi bi-info-circle me-2"></i>
        More settings coming soon!
      </div>
    </div>
  `,
  styles: [``]
})
export class SettingsComponent {
  constructor(
    private dialogService: DialogService,
    private db: DatabaseService
  ) {}

  async clearData() {
    const confirmed = await this.dialogService.confirm(
      'Are you sure you want to clear all data? This action cannot be undone.',
      'Clear All Data',
      'Clear Data',
      'Cancel',
      { variant: 'danger' }
    );
    
    if (confirmed) {
      try {
        await this.db.songSheets.clear();
        await this.db.rhythmPatterns.clear();
        await this.dialogService.alert(
          'All data has been cleared. Please refresh the page to see the changes.',
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
