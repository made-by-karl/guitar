import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  MODAL_DATA,
  MODAL_REF,
  ModalComponent,
  ModalDataComponent,
  ModalRef
} from '@/app/core/services/modal.service';

export interface SongSheetLinkEditorModalData {
  title: string;
  link: SongSheetLinkEditorResult | null;
}

export interface SongSheetLinkEditorResult {
  url: string;
  description: string;
}

@Component({
  selector: 'app-song-sheet-link-editor-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './song-sheet-link-editor-modal.component.html',
  styleUrls: ['./song-sheet-link-editor-modal.component.scss']
})
export class SongSheetLinkEditorModalComponent
implements ModalComponent<SongSheetLinkEditorResult | undefined>, ModalDataComponent<SongSheetLinkEditorModalData> {
  url = '';
  description = '';
  error = '';

  constructor(
    @Inject(MODAL_REF) public modalRef: ModalRef<SongSheetLinkEditorResult | undefined>,
    @Inject(MODAL_DATA) public data: SongSheetLinkEditorModalData
  ) {
    this.url = data.link?.url ?? '';
    this.description = data.link?.description ?? '';
  }

  save(): void {
    const normalizedUrl = this.normalizeUrl(this.url);
    if (!normalizedUrl) {
      this.error = 'Enter a valid http(s) URL.';
      return;
    }

    this.modalRef.close({
      url: normalizedUrl,
      description: this.description.trim()
    });
  }

  cancel(): void {
    this.modalRef.close(undefined);
  }

  clearError(): void {
    this.error = '';
  }

  private normalizeUrl(value: string): string | null {
    const trimmedValue = value.trim();

    try {
      const parsed = new URL(trimmedValue);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null;
      }

      return parsed.toString();
    } catch {
      return null;
    }
  }
}
