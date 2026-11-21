import { MediaPlaybackControlsComponent } from '@/app/core/ui/media-playback-controls/media-playback-controls.component';
import { patternPreviewMeasures } from '@/app/features/patterns/ui/measure-editor-preview/pattern-preview-measures';
import { Component, Inject, signal } from '@angular/core';
import { MODAL_DATA, MODAL_REF, ModalRef, ModalService } from '@/app/core/services/modal.service';
import { PlayingPatternEditorComponent } from '@/app/features/patterns/ui/playing-pattern-editor/playing-pattern-editor.component';
import { MeasureEditorPreviewComponent } from '@/app/features/patterns/ui/measure-editor-preview/measure-editor-preview.component';
import { SongSheetPattern, SongSheetWithData } from '@/app/features/sheets/services/song-sheets.model';
import { cloneSongSheetPattern } from '../song-sheet.helpers';
import { SongSheetChoiceModalComponent } from '../song-sheet-choice-modal.component';

export interface SongPatternWorkspaceData {
  sheet: SongSheetWithData;
  pattern: SongSheetPattern;
  create: boolean;
  save: (pattern: SongSheetPattern) => Promise<void>;
}

@Component({
  selector: 'app-song-pattern-workspace',
  imports: [MediaPlaybackControlsComponent, PlayingPatternEditorComponent, MeasureEditorPreviewComponent],
  templateUrl: './song-pattern-workspace.component.html',
  styleUrl: './song-pattern-workspace.component.scss'
})
export class SongPatternWorkspaceComponent {
  readonly saving = signal(false);
  readonly error = signal('');
  draft: SongSheetPattern;
  previewMeasures() { return patternPreviewMeasures(this.draft); }
  private readonly initial: string;
  private deciding = false;

  constructor(@Inject(MODAL_DATA) public data: SongPatternWorkspaceData,
    @Inject(MODAL_REF) public ref: ModalRef<SongSheetPattern>, private modal: ModalService) {
    this.draft = cloneSongSheetPattern(data.pattern);
    this.initial = JSON.stringify(this.draft);
  }

  hasUnsavedChanges(): boolean {
    return this.data.create || JSON.stringify(this.draft) !== this.initial;
  }

  async canLeave(): Promise<boolean> {
    if (this.saving() || this.deciding) return false;
    if (!this.hasUnsavedChanges()) return true;
    this.deciding = true;
    try {
      const ref = this.modal.show(SongSheetChoiceModalComponent, { data: { title: 'Keep your pattern changes?', choices: [
        { value: 'save', text: 'Save and continue' }, { value: 'discard', text: 'Discard changes' }, { value: 'stay', text: 'Keep editing' }
      ] }, width: '420px', maxWidth: '95vw', closeOnBackdropClick: false });
      const choice = await ref.afterClosed();
      if (choice === 'save') return this.save();
      return choice === 'discard';
    } finally { this.deciding = false; }
  }

  cancel(): void { if (!this.saving()) this.ref.close(undefined); }

  async save(): Promise<boolean> {
    if (this.saving()) return false;
    this.saving.set(true);
    this.error.set('');
    try {
      const pattern = cloneSongSheetPattern(this.draft);
      await this.data.save(pattern);
      this.ref.close(pattern);
      return true;
    } catch {
      this.error.set('Could not save pattern. Your changes are still here. Try again.');
      return false;
    } finally { this.saving.set(false); }
  }
}
