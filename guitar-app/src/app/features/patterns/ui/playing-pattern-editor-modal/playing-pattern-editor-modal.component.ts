import { MediaPlaybackControlsComponent } from '@/app/core/ui/media-playback-controls/media-playback-controls.component';
import { MeasureEditorPreviewComponent } from '@/app/features/patterns/ui/measure-editor-preview/measure-editor-preview.component';
import { Component, Inject, ViewChild, viewChild } from '@angular/core';
import { Note } from '@/app/core/music/semitones';
import { CommonModule } from '@angular/common';
import { PlayingPatternEditorComponent } from '@/app/features/patterns/ui/playing-pattern-editor/playing-pattern-editor.component';
import { PlayingPattern, PlayingPatternGripReference } from '@/app/features/patterns/services/playing-patterns.model';
import {MODAL_REF, ModalComponent, ModalRef} from '@/app/core/services/modal.service';

@Component({
  selector: 'app-playing-pattern-editor-modal',
  standalone: true,
  imports: [MediaPlaybackControlsComponent, CommonModule, PlayingPatternEditorComponent, MeasureEditorPreviewComponent],
  templateUrl: './playing-pattern-editor-modal.component.html',
  styleUrls: ['./playing-pattern-editor-modal.component.scss']
})
export class PlayingPatternEditorModalComponent implements ModalComponent<PlayingPattern> {
  readonly previewEditor = viewChild(PlayingPatternEditorComponent);
  @ViewChild('editor', { static: false }) editor!: PlayingPatternEditorComponent;

  pattern?: PlayingPattern;
  savedGrips: PlayingPatternGripReference[] = [];
  tuning?: Note[];
  capodaster = 0;
  tempo = 80;
  mode: 'create' | 'edit' | 'clone' = 'edit';

  get title(): string {
    if (this.mode === 'clone') {
      return 'Clone Playing Pattern';
    }

    return this.mode === 'create' ? 'Create Playing Pattern' : 'Edit Playing Pattern';
  }

  get saveLabel(): string {
    return this.mode === 'clone' ? 'Save Copy' : 'Save Pattern';
  }

  constructor(
    @Inject(MODAL_REF) public modalRef: ModalRef<PlayingPattern>
  ) {}

  onSave() {
    if (this.editor) {
      const savedPattern = this.editor.pattern();
      this.modalRef.close(savedPattern);
    }
  }

  onCancel() {
    this.modalRef.close(undefined);
  }

  playPattern() {
    if (this.editor) {
      this.editor.playPattern();
    }
  }

  isPatternPlaybackActive(): boolean {
    return this.editor ? this.editor.isPatternPlaybackActive() : false;
  }
}
