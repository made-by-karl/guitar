import {AfterViewInit, Component, ElementRef, Inject, OnDestroy, OnInit, TemplateRef, ViewChild} from '@angular/core';
import {CommonModule, DOCUMENT} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {PlayingPatternsService} from '@/app/features/patterns/services/playing-patterns.service';
import {PlayingPattern} from '@/app/features/patterns/services/playing-patterns.model';
import {DialogService} from '@/app/core/services/dialog.service';
import {ModalService} from '@/app/core/services/modal.service';
import {NotificationService} from '@/app/core/services/notification.service';
import {
  PlayingPatternEditorModalComponent
} from '@/app/features/patterns/ui/playing-pattern-editor-modal/playing-pattern-editor-modal.component';
import {PlayingActionsComponent} from '@/app/features/patterns/ui/playing-actions/playing-actions.component';
import { PlayingActionsNotationContext } from '@/app/features/patterns/ui/playing-actions/playing-actions.component';
import {Subscription} from 'rxjs';
import {PatternPlaybackService} from '@/app/features/patterns/services/pattern-playback.service';
import {PageToolbarProvider} from '@/app/core/ui/page-toolbar-provider';

type PatternEditorMode = 'create' | 'edit' | 'clone';

@Component({
  selector: 'app-patterns-library',
  standalone: true,
  imports: [CommonModule, FormsModule, PlayingActionsComponent],
  templateUrl: './patterns-library.component.html',
  styleUrls: ['./patterns-library.component.scss']
})
export class PatternsLibraryComponent implements OnInit, AfterViewInit, OnDestroy, PageToolbarProvider {
  @ViewChild('pageToolbar', { static: true }) private readonly pageToolbarTemplateRef?: TemplateRef<object>;
  @ViewChild('pageHeader', { read: ElementRef }) private readonly pageHeaderRef?: ElementRef<HTMLElement>;

  patterns: PlayingPattern[] = [];
  search = '';
  showToolbarCreateButton = false;
  readonly toolbarContext = null;
  playbackState = { status: 'idle' } as ReturnType<PatternPlaybackService['getSnapshot']>;
  private readonly playbackStateSubscription: Subscription;
  private headerVisibilityObserver?: IntersectionObserver;

  constructor(
    public service: PlayingPatternsService,
    private patternPlayback: PatternPlaybackService,
    private dialogService: DialogService,
    private modalService: ModalService,
    private notificationService: NotificationService,
    @Inject(DOCUMENT) private document: Document
  ) {
    this.playbackState = this.patternPlayback.getSnapshot();
    this.playbackStateSubscription = this.patternPlayback.state$.subscribe(state => {
      this.playbackState = state;
    });
  }

  ngOnInit() {
    this.load();
  }

  ngAfterViewInit(): void {
    this.observePageHeaderVisibility();
  }

  ngOnDestroy(): void {
    this.headerVisibilityObserver?.disconnect();
    this.playbackStateSubscription.unsubscribe();
    this.patternPlayback.stopPatternPreview();
  }

  get toolbarTemplate(): TemplateRef<object> | null {
    return this.pageToolbarTemplateRef ?? null;
  }

  async load() {
    this.patterns = await this.service.getAll();
  }

  async startCreate() {
    const pattern: PlayingPattern = {
      id: Date.now().toString(),
      name: '',
      description: '',
      category: '',
      suggestedGenre: '',
      exampleSong: '',
      measures: [{
        timeSignature: '4/4',
        actions: Array(16).fill(null)
      }],
      actionGrips: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isCustom: true
    };

    await this.openPatternEditor(pattern, 'create');
  }

  async startEdit(pattern: PlayingPattern) {
    if (!pattern.isCustom) {
      await this.startClone(pattern);
      return;
    }

    await this.openPatternEditor(pattern, 'edit');
  }

  async startClone(pattern: PlayingPattern) {
    await this.openPatternEditor(this.service.createClone(pattern), 'clone');
  }

  private async openPatternEditor(pattern: PlayingPattern, mode: PatternEditorMode) {
    const modalRef = this.modalService.show(PlayingPatternEditorModalComponent, {
      width: '95vw',
      height: '90vh',
      maxHeight: '90vh',
      panelClass: 'modal-xl',
      closeOnBackdropClick: false
    });

    // Set the pattern on the component instance
    if (modalRef.componentInstance) {
      modalRef.componentInstance.pattern = pattern;
      modalRef.componentInstance.mode = mode;
    }

    // Wait for the modal to close
    const result = await modalRef.afterClosed();

    if (result) {
      await this.onPatternSaved(result, mode);
    }
  }

  private async onPatternSaved(pattern: PlayingPattern, mode: PatternEditorMode) {
    // Check if this is a new pattern (not in our patterns array yet)
    const existingPatternIndex = this.patterns.findIndex(p => p.id === pattern.id);

    if (existingPatternIndex === -1) {
      // New pattern - add it
      await this.service.add(pattern);
    } else {
      // Existing pattern - update it
      await this.service.update(pattern);
    }

    await this.load();

    if (mode === 'clone') {
      this.notificationService.success(`Cloned pattern "${pattern.name || 'Untitled Pattern'}"`);
    }
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

    try {
      await this.patternPlayback.togglePatternPreview(pattern);
    } catch (error) {
      console.error('Error playing playing pattern:', error);
    }
  }

  isPatternPlaybackActive(pattern: PlayingPattern): boolean {
    return this.playbackState.status === 'playing' && this.playbackState.patternId === pattern.id;
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

  async deletePattern(pattern: PlayingPattern) {
    const restoreHint = pattern.isCustom ? '' : ' You can restore deleted default patterns from the pattern library menu.';
    const confirmed = await this.dialogService.confirm(
      `Delete this pattern?${restoreHint}`,
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

  async restoreDefaultPatterns() {
    const restoredCount = await this.service.restoreMissingDefaults();
    await this.load();
    await this.dialogService.alert(
      restoredCount > 0
        ? `Restored ${restoredCount} default pattern${restoredCount === 1 ? '' : 's'}.`
        : 'All default patterns are already in your library.',
      'Restore Defaults',
      'OK',
      { variant: 'success' }
    );
  }

  private observePageHeaderVisibility(): void {
    const headerElement = this.pageHeaderRef?.nativeElement;
    const scrollContainer = this.document.querySelector('.app-content-container');

    if (!headerElement || !(scrollContainer instanceof HTMLElement) || typeof IntersectionObserver === 'undefined') {
      this.showToolbarCreateButton = true;
      return;
    }

    this.headerVisibilityObserver = new IntersectionObserver(
      ([entry]) => {
        this.showToolbarCreateButton = !entry.isIntersecting;
      },
      {
        root: scrollContainer,
        threshold: 0.1
      }
    );

    this.headerVisibilityObserver.observe(headerElement);
  }
}
