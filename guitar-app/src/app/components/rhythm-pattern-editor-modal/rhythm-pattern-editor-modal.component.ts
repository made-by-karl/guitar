import { Component, Inject, ViewChild, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RhythmPatternEditorComponent } from '../rhythm-pattern-editor/rhythm-pattern-editor.component';
import { RhythmPattern } from '../../services/rhythm-patterns.model';
import { MODAL_REF, ModalRef } from '../../services/modal.service';

@Component({
  selector: 'app-rhythm-pattern-editor-modal',
  standalone: true,
  imports: [CommonModule, RhythmPatternEditorComponent],
  templateUrl: './rhythm-pattern-editor-modal.component.html',
  styleUrls: ['./rhythm-pattern-editor-modal.component.scss']
})
export class RhythmPatternEditorModalComponent implements OnInit {
  @ViewChild('editor', { static: false }) editor!: RhythmPatternEditorComponent;
  
  pattern?: RhythmPattern;

  constructor(
    @Inject(MODAL_REF) private modalRef: ModalRef<RhythmPattern>
  ) {}

  ngOnInit() {
    // Pattern will be set via data injection or direct assignment
  }

  onSave() {
    if (this.editor) {
      const savedPattern = this.editor.pattern();
      this.modalRef.close(savedPattern);
    }
  }

  onCancel() {
    this.modalRef.close(undefined);
  }

  onPlayPattern() {
    if (this.editor) {
      this.editor.playPattern();
    }
  }
}
