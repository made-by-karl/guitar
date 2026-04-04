import {Component, EventEmitter, OnDestroy, Output} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {RhythmPatternsService} from '@/app/features/patterns/services/rhythm-patterns.service';
import {RhythmPattern} from '@/app/features/patterns/services/rhythm-patterns.model';
import {RhythmActionsComponent} from '@/app/features/patterns/ui/rhythm-actions/rhythm-actions.component';
import {PatternPlaybackService} from '@/app/features/patterns/services/pattern-playback.service';
import {Subscription} from 'rxjs';

export interface PatternSelectorResult {
  patterns: RhythmPattern[];
}

@Component({
  selector: 'app-patterns-library-selector',
  standalone: true,
  imports: [CommonModule, FormsModule, RhythmActionsComponent],
  templateUrl: './patterns-library-selector.component.html',
  styleUrls: ['./patterns-library-selector.component.scss']
})
export class PatternsLibrarySelectorComponent implements OnDestroy {
  @Output() selectedPatternsChange = new EventEmitter<PatternSelectorResult>();

  patterns: RhythmPattern[] = [];
  search = '';
  playbackState = { status: 'idle' } as ReturnType<PatternPlaybackService['getSnapshot']>;
  private selectedPatternIds = new Set<string>();
  private readonly playbackStateSubscription: Subscription;

  constructor(
    public service: RhythmPatternsService,
    private patternPlayback: PatternPlaybackService
  ) {
    this.playbackState = this.patternPlayback.getSnapshot();
    this.playbackStateSubscription = this.patternPlayback.state$.subscribe(state => {
      this.playbackState = state;
    });
    this.load();
  }

  ngOnDestroy(): void {
    this.playbackStateSubscription.unsubscribe();
    this.patternPlayback.stopPatternPreview();
  }

  async load() {
    this.patterns = await this.service.getAll();
    this.reconcileSelectionWithPatterns();
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

    // Use the new MIDI service to play the entire rhythm pattern
    try {
      await this.patternPlayback.togglePatternPreview(pattern);
    } catch (error) {
      console.error('Error playing rhythm pattern:', error);
    }
  }

  isPatternPlaybackActive(pattern: RhythmPattern): boolean {
    return this.playbackState.status === 'playing' && this.playbackState.patternId === pattern.id;
  }

  isSelected(pattern: RhythmPattern): boolean {
    return this.selectedPatternIds.has(this.getPatternKey(pattern));
  }

  toggleSelection(pattern: RhythmPattern, isSelected: boolean) {
    const patternKey = this.getPatternKey(pattern);

    if (isSelected) {
      this.selectedPatternIds.add(patternKey);
    } else {
      this.selectedPatternIds.delete(patternKey);
    }

    this.emitSelectedPatterns();
  }

  onPatternCardClick(pattern: RhythmPattern) {
    this.toggleSelection(pattern, !this.isSelected(pattern));
  }

  onPatternCardKeydown(event: KeyboardEvent, pattern: RhythmPattern) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.onPatternCardClick(pattern);
    }
  }

  private emitSelectedPatterns() {
    const selectedPatterns = this.patterns.filter(pattern => this.selectedPatternIds.has(this.getPatternKey(pattern)));
    this.selectedPatternsChange.emit({patterns: selectedPatterns});
  }

  private reconcileSelectionWithPatterns() {
    const availablePatternKeys = new Set(this.patterns.map(pattern => this.getPatternKey(pattern)));
    this.selectedPatternIds = new Set(
      [...this.selectedPatternIds].filter(patternKey => availablePatternKeys.has(patternKey))
    );
    this.emitSelectedPatterns();
  }

  private getPatternKey(pattern: RhythmPattern): string {
    return pattern.id;
  }
}
