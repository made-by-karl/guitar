import { Component, Inject, ViewChild, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RhythmPatternEditorComponent } from '@/app/features/patterns/ui/rhythm-pattern-editor/rhythm-pattern-editor.component';
import { RhythmPattern } from '@/app/features/patterns/services/rhythm-patterns.model';
import {MODAL_REF, ModalComponent, ModalRef} from '@/app/core/services/modal.service';

@Component({
  selector: 'app-rhythm-pattern-editor-modal',
  standalone: true,
  imports: [CommonModule, RhythmPatternEditorComponent],
  templateUrl: './rhythm-pattern-editor-modal.component.html',
  styleUrls: ['./rhythm-pattern-editor-modal.component.scss']
})
export class RhythmPatternEditorModalComponent implements ModalComponent<RhythmPattern> {
  @ViewChild('editor', { static: false }) editor!: RhythmPatternEditorComponent;

  pattern?: RhythmPattern;

  constructor(
    @Inject(MODAL_REF) public modalRef: ModalRef<RhythmPattern>
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
