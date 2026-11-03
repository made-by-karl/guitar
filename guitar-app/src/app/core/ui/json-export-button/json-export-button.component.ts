import { Component, Input } from '@angular/core';
import { DataTransferService } from '@/app/core/services/data-transfer.service';
import { PlayingPattern } from '@/app/features/patterns/services/playing-patterns.model';

@Component({
  selector: 'app-json-export-button',
  standalone: true,
  template: `
    <button type="button" class="btn btn-outline-secondary btn-sm" [disabled]="busy" (click)="download()">
      <i class="bi bi-download me-1" aria-hidden="true"></i>{{ busy ? 'Exporting…' : 'Export JSON' }}
    </button>
    @if (error) { <span class="d-block text-danger small" role="alert">{{ error }}</span> }
  `,
  styles: [':host { display: inline-block; } button { min-height: 44px; }']
})
export class JsonExportButtonComponent {
  @Input() sheetId?: string;
  @Input() pattern?: PlayingPattern;
  busy = false;
  error = '';
  constructor(private readonly transfer: DataTransferService) {}
  async download(): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.error = '';
    try {
      if (this.sheetId) await this.transfer.exportSheet(this.sheetId);
      else if (this.pattern) this.transfer.exportPattern(this.pattern);
    } catch (error) { this.error = error instanceof Error ? error.message : 'Export failed. Try again.'; }
    finally { this.busy = false; }
  }
}
