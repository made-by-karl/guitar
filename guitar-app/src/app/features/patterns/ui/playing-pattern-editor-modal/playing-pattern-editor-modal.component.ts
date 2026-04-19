import { Component, Inject, ViewChild, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlayingPatternEditorComponent } from '@/app/features/patterns/ui/playing-pattern-editor/playing-pattern-editor.component';
import { PlayingPattern } from '@/app/features/patterns/services/playing-patterns.model';
import {MODAL_REF, ModalComponent, ModalRef} from '@/app/core/services/modal.service';

@Component({
  selector: 'app-playing-pattern-editor-modal',
  standalone: true,
  imports: [CommonModule, PlayingPatternEditorComponent],
  templateUrl: './playing-pattern-editor-modal.component.html',
  styleUrls: ['./playing-pattern-editor-modal.component.scss']
})
export class PlayingPatternEditorModalComponent implements ModalComponent<PlayingPattern> {
  @ViewChild('editor', { static: false }) editor!: PlayingPatternEditorComponent;

  pattern?: PlayingPattern;
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
