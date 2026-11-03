import { Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataTransferService, TransferInspection } from '@/app/core/services/data-transfer.service';
import { TransferKind } from '@/app/core/services/data-transfer-format';

@Component({
  selector: 'app-json-import',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './json-import.component.html',
  styleUrl: './json-import.component.scss'
})
export class JsonImportComponent implements OnDestroy {
  @Input({ required: true }) kind!: TransferKind;
  @Output() imported = new EventEmitter<void>();
  @ViewChild('picker') picker?: ElementRef<HTMLInputElement>;
  inspection?: TransferInspection;
  filename = '';
  error = '';
  status = '';
  reading = false;
  writing = false;
  mode: 'merge' | 'replace' = 'merge';
  replaceConfirmed = false;
  private selection = 0;

  constructor(private readonly transfer: DataTransferService) {}

  get label(): string {
    return this.kind === 'guitar-backup' ? 'Restore backup JSON' : this.kind === 'guitar-song-sheet' ? 'Import song sheet JSON' : 'Import playing pattern JSON';
  }

  get counts(): { sheets?: number; patterns?: number; measures?: number; parts?: number; occurrences?: number; grips?: number } {
    const file = this.inspection?.file;
    if (!file) return {};
    if (file.format === 'guitar-backup') return { sheets: file.data.songSheets.length, patterns: file.data.playingPatterns.length };
    if (file.format === 'guitar-song-sheet') return {
      patterns: file.data.patterns.length, parts: file.data.parts.length,
      occurrences: file.data.arrangement?.length ?? file.data.parts.length, grips: file.data.grips.length,
      measures: file.data.parts.reduce((count, part) => count + part.measures.length, 0)
    };
    return { measures: file.data.measures.length };
  }

  async choose(event: Event): Promise<void> {
    if (this.writing) return;
    const input = event.target as HTMLInputElement, file = input.files?.[0];
    input.value = ''; // Selecting the same file again must dispatch change.
    const selection = ++this.selection;
    this.inspection = undefined; this.error = ''; this.status = ''; this.replaceConfirmed = false;
    this.filename = file?.name ?? ''; this.reading = !!file;
    if (!file) return;
    try {
      const inspection = await this.transfer.inspect(await file.text(), this.kind);
      if (selection === this.selection) this.inspection = inspection;
    } catch (error) {
      if (selection === this.selection) this.error = this.message(error);
    } finally {
      if (selection === this.selection) this.reading = false;
    }
  }

  cancel(): void {
    if (this.writing) return;
    ++this.selection; this.inspection = undefined; this.reading = false; this.error = ''; this.status = ''; this.filename = '';
    this.replaceConfirmed = false;
    this.picker?.nativeElement.focus();
  }

  async apply(): Promise<void> {
    const inspection = this.inspection;
    if (!inspection || this.reading || this.writing || (inspection.file.format === 'guitar-backup' && this.mode === 'replace' && !this.replaceConfirmed)) return;
    this.writing = true; this.error = ''; this.status = '';
    try {
      if (inspection.file.format === 'guitar-backup') {
        await this.transfer.restore(inspection, this.mode);
        this.status = 'Backup restored. Reloading…';
        // A full reload after commit releases playback and all cached editor/library state.
        window.location.reload();
      } else {
        const name = await this.transfer.importCopy(inspection);
        this.inspection = undefined;
        this.status = `Imported “${name || 'Untitled'}”.`;
        this.imported.emit();
        this.picker?.nativeElement.focus();
      }
    } catch (error) { this.error = `${this.message(error)} Nothing was imported. You can retry or choose another file.`; }
    finally { this.writing = false; }
  }

  ngOnDestroy(): void { ++this.selection; }
  private message(error: unknown): string { return error instanceof Error ? error.message : 'The file could not be imported.'; }
}
