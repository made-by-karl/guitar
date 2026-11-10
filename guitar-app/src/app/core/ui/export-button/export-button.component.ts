import { Component, Input } from '@angular/core';
import { DataTransferService, ExportType } from '@/app/core/services/data-transfer.service';

@Component({
  selector: 'app-export-button',
  standalone: true,
  template: `
    <button type="button" class="btn btn-outline-secondary btn-sm" [disabled]="busy"
      [attr.aria-label]="busy ? 'Exporting…' : 'Export'" [attr.aria-busy]="busy" title="Export" (click)="download()">
      <i class="bi bi-download" aria-hidden="true"></i>
      <span class="d-none d-sm-inline ms-1">{{ busy ? 'Exporting…' : 'Export' }}</span>
    </button>
    @if (error) { <span class="d-block text-danger small" role="alert">{{ error }}</span> }
  `,
  styleUrl: './export-button.component.scss'
})
export class ExportButtonComponent {
  @Input({ required: true }) id!: string;
  @Input({ required: true }) type!: ExportType;
  @Input() sheetId?: string;
  busy = false;
  error = '';

  constructor(private readonly transfer: DataTransferService) {}

  async download(): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.error = '';
    try {
      await this.transfer.export(this.id, this.type, this.sheetId);
    } catch (error) { this.error = error instanceof Error ? error.message : 'Export failed. Try again.'; }
    finally { this.busy = false; }
  }
}
