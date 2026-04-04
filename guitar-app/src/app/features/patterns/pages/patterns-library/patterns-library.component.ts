import {Component, OnDestroy, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {RhythmPatternsService} from '@/app/features/patterns/services/rhythm-patterns.service';
import {RhythmPattern} from '@/app/features/patterns/services/rhythm-patterns.model';
import {DialogService} from '@/app/core/services/dialog.service';
import {ModalService} from '@/app/core/services/modal.service';
import {
  RhythmPatternEditorModalComponent
} from '@/app/features/patterns/ui/rhythm-pattern-editor-modal/rhythm-pattern-editor-modal.component';
import {RhythmActionsComponent} from '@/app/features/patterns/ui/rhythm-actions/rhythm-actions.component';
import {Subscription} from 'rxjs';
import {PatternPlaybackService} from '@/app/features/patterns/services/pattern-playback.service';

@Component({
  selector: 'app-patterns-library',
  standalone: true,
  imports: [CommonModule, FormsModule, RhythmActionsComponent],
  templateUrl: './patterns-library.component.html',
  styleUrls: ['./patterns-library.component.scss']
})
export class PatternsLibraryComponent implements OnInit, OnDestroy {
  patterns: RhythmPattern[] = [];
  search = '';
  playbackState = { status: 'idle' } as ReturnType<PatternPlaybackService['getSnapshot']>;
  private readonly playbackStateSubscription: Subscription;

  constructor(
    public service: RhythmPatternsService,
    private patternPlayback: PatternPlaybackService,
    private dialogService: DialogService,
    private modalService: ModalService
  ) {
    this.playbackState = this.patternPlayback.getSnapshot();
    this.playbackStateSubscription = this.patternPlayback.state$.subscribe(state => {
      this.playbackState = state;
    });
  }

  ngOnInit() {
    this.load();
  }

  ngOnDestroy(): void {
    this.playbackStateSubscription.unsubscribe();
    this.patternPlayback.stopPatternPreview();
  }

  async load() {
    this.patterns = await this.service.getAll();
  }

  async startCreate() {
    const pattern: RhythmPattern = {
      id: Date.now().toString(),
      name: '',
      description: '',
      category: '',
      measures: [{
        timeSignature: '4/4',
        actions: Array(16).fill(null)
      }],
      beatGrips: [],
      actionGripOverrides: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isCustom: true
    };

    await this.openPatternEditor(pattern);
  }

  async startEdit(pattern: RhythmPattern) {
    await this.openPatternEditor(pattern);
  }

  private async openPatternEditor(pattern: RhythmPattern) {
    const modalRef = this.modalService.show(RhythmPatternEditorModalComponent, {
      width: '95vw',
      height: '90vh',
      maxHeight: '90vh',
      panelClass: 'modal-xl',
      closeOnBackdropClick: false
    });

    // Set the pattern on the component instance
    if (modalRef.componentInstance) {
      modalRef.componentInstance.pattern = pattern;
    }

    // Wait for the modal to close
    const result = await modalRef.afterClosed();

    if (result) {
      await this.onPatternSaved(result);
    }
  }

  private async onPatternSaved(pattern: RhythmPattern) {
    // Check if this is a new pattern (not in our patterns array yet)
    const existingPatternIndex = this.patterns.findIndex(p => p.id === pattern.id);

    if (existingPatternIndex === -1) {
      // New pattern - add it
      await this.service.add(pattern);
      this.patterns.push(pattern);
    } else {
      // Existing pattern - update it
      await this.service.update(pattern);
      this.patterns[existingPatternIndex] = pattern;
    }
  }

  get filteredPatterns() {
    if (!this.search.trim()) return this.patterns;
    const q = this.search.toLowerCase();
    return this.patterns.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      (p.category && p.category.toLowerCase().includes(q))
    );
  }

  async playPattern(pattern: RhythmPattern) {
    if (!pattern.measures || pattern.measures.length === 0) {
      console.error('Pattern has no measures:', pattern);
      return;
    }

    try {
      await this.patternPlayback.togglePatternPreview(pattern);
    } catch (error) {
      console.error('Error playing rhythm pattern:', error);
    }
  }

  isPatternPlaybackActive(pattern: RhythmPattern): boolean {
    return this.playbackState.status === 'playing' && this.playbackState.patternId === pattern.id;
  }

  async deletePattern(pattern: RhythmPattern) {
    const confirmed = await this.dialogService.confirm(
      'Delete this pattern?',
      'Delete Pattern',
      'Delete',
      'Cancel',
      { variant: 'danger' }
    );

    if (confirmed) {
      await this.service.delete(pattern.id);
      await this.load();
    }
  }
}
