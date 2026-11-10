import {Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges} from '@angular/core';
import { SelectionMode } from '@/app/core/ui/selection-mode';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {PlayingPatternsService} from '@/app/features/patterns/services/playing-patterns.service';
import {PlayingPattern} from '@/app/features/patterns/services/playing-patterns.model';
import {PlayingActionsComponent} from '@/app/features/patterns/ui/playing-actions/playing-actions.component';
import { PlayingActionsNotationContext } from '@/app/features/patterns/ui/playing-actions/playing-actions.component';
import {PatternPlaybackService} from '@/app/features/patterns/services/pattern-playback.service';
import {Subscription} from 'rxjs';

export interface PatternSelectorResult {
  patterns: PlayingPattern[];
}

@Component({
  selector: 'app-patterns-library-selector',
  standalone: true,
  imports: [CommonModule, FormsModule, PlayingActionsComponent],
  templateUrl: './patterns-library-selector.component.html',
  styleUrls: ['./patterns-library-selector.component.scss']
})
export class PatternsLibrarySelectorComponent implements OnDestroy, OnChanges {
  @Output() selectedPatternsChange = new EventEmitter<PatternSelectorResult>();
  @Input() selectionMode: SelectionMode = 'multiple';

  patterns: PlayingPattern[] = [];
  search = '';
  playbackState = { status: 'idle' } as ReturnType<PatternPlaybackService['getSnapshot']>;
  private selectedPatternIds = new Set<string>();
  private readonly playbackStateSubscription: Subscription;

  constructor(
    public service: PlayingPatternsService,
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

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectionMode'] && this.selectionMode === 'single' && this.selectedPatternIds.size > 1) {
      this.selectedPatternIds = new Set([...this.selectedPatternIds].slice(-1));
      this.emitSelectedPatterns();
    }
  }

  cardTabIndex(pattern: PlayingPattern, index: number): number {
    return this.selectionMode === 'multiple' || this.isSelected(pattern) ||
      (index === 0 && !this.filteredPatterns.some(item => this.isSelected(item))) ? 0 : -1;
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
      p.suggestedGenre.toLowerCase().includes(q) ||
      p.exampleSong.toLowerCase().includes(q) ||
      (p.category && p.category.toLowerCase().includes(q))
    );
  }

  async playPattern(pattern: PlayingPattern) {
    if (!pattern.measures || pattern.measures.length === 0) {
      console.error('Pattern has no measures:', pattern);
      return;
    }

    // Use the new MIDI service to play the entire playing pattern
    try {
      await this.patternPlayback.togglePatternPreview(pattern);
    } catch (error) {
      console.error('Error playing playing pattern:', error);
    }
  }

  isPatternPlaybackActive(pattern: PlayingPattern): boolean {
    return (this.playbackState.status === 'playing' || this.playbackState.status === 'preparing') && this.playbackState.patternId === pattern.id;
  }

  getMeasureNotationContext(pattern: PlayingPattern, measureIndex: number): PlayingActionsNotationContext {
    return {
      timeSignature: pattern.measures[measureIndex].timeSignature,
      actionGrips: (pattern.actionGrips ?? []).filter(grip => grip.measureIndex === measureIndex)
    };
  }

  getMeasureNotationContexts(pattern: PlayingPattern): PlayingActionsNotationContext[] {
    return pattern.measures.map((_, measureIndex) => this.getMeasureNotationContext(pattern, measureIndex));
  }

  isSelected(pattern: PlayingPattern): boolean {
    return this.selectedPatternIds.has(this.getPatternKey(pattern));
  }

  toggleSelection(pattern: PlayingPattern, isSelected: boolean) {
    const patternKey = this.getPatternKey(pattern);

    if (isSelected) {
      if (this.selectionMode === 'single') this.selectedPatternIds.clear();
      this.selectedPatternIds.add(patternKey);
    } else {
      this.selectedPatternIds.delete(patternKey);
    }

    this.emitSelectedPatterns();
  }

  onPatternCardClick(pattern: PlayingPattern) {
    this.toggleSelection(pattern, this.selectionMode === 'single' || !this.isSelected(pattern));
  }

  onPatternCardKeydown(event: KeyboardEvent, pattern: PlayingPattern) {
    if (event.target !== event.currentTarget) return;
    if (this.selectionMode === 'single' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const patterns = this.filteredPatterns;
      const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      const index = patterns.findIndex(item => item.id === pattern.id);
      const next = (index + direction + patterns.length) % patterns.length;
      if (!patterns[next]) return;
      this.toggleSelection(patterns[next], true);
      if (event.currentTarget instanceof HTMLElement) {
        event.currentTarget.closest('[role="radiogroup"]')?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
      }
      return;
    }
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

  private getPatternKey(pattern: PlayingPattern): string {
    return pattern.id;
  }
}
