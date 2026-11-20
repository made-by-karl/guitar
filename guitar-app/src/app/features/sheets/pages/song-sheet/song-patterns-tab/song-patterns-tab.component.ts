import { NgComponentOutlet } from '@angular/common';
import { MODAL_DATA, MODAL_REF, ModalRef } from '@/app/core/services/modal.service';
import { SongPatternWorkspaceComponent, SongPatternWorkspaceData } from '../song-pattern-workspace/song-pattern-workspace.component';
import { ExportButtonComponent } from '@/app/core/ui/export-button/export-button.component';
import { afterNextRender, Component, ElementRef, HostListener, Injector, OnDestroy, ViewChild, inject, input, output, signal } from '@angular/core';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { ModalService } from '@/app/core/services/modal.service';
import { DialogService } from '@/app/core/services/dialog.service';
import { NotificationService } from '@/app/core/services/notification.service';
import { transpose } from '@/app/core/music/semitones';
import { PatternPlaybackService, PatternPlaybackState } from '@/app/features/patterns/services/pattern-playback.service';
import { PlayingPattern } from '@/app/features/patterns/services/playing-patterns.model';
import { PatternLibrarySelectorModalComponent } from '@/app/features/patterns/ui/pattern-library-selector-modal/pattern-library-selector-modal.component';
import { PlayingActionsComponent, PlayingActionsNotationContext } from '@/app/features/patterns/ui/playing-actions/playing-actions.component';
import { SongPartPlaybackService } from '@/app/features/sheets/services/song-part-playback.service';
import { SongSheetPattern, SongSheetWithData } from '@/app/features/sheets/services/song-sheets.model';
import { SongSheetsService } from '@/app/features/sheets/services/song-sheets.service';
import { Subscription } from 'rxjs';
import {
  buildGripByIdMap,
  cloneSongSheetPattern,
  createEmptySongSheetPattern,
  toSongSheetPattern
} from '../song-sheet.helpers';
import { SongSheetChoice, SongSheetChoiceModalComponent, SongSheetChoiceModalData } from '../song-sheet-choice-modal.component';

@Component({
  selector: 'app-song-sheet-patterns-tab',
  host: { '[style.--pattern-workspace-height]': "workspaceHeight() === null ? null : workspaceHeight() + 'px'" },
  standalone: true,
  imports: [NgComponentOutlet, DragDropModule, PlayingActionsComponent, ExportButtonComponent],
  templateUrl: './song-patterns-tab.component.html',
  styleUrl: './song-patterns-tab.component.scss'
})
export class SongPatternsTabComponent implements OnDestroy {
  readonly sheet = input.required<SongSheetWithData>();
  readonly changed = output<void>();
  readonly editorInjector = signal<Injector | undefined>(undefined);
  readonly editorComponent = SongPatternWorkspaceComponent;
  readonly editingName = signal('');
  readonly workspaceHeight = signal<number | null>(null);
  private parentFocus: Element | null = null;
  private readonly injector = inject(Injector);
  @ViewChild(NgComponentOutlet) private outlet?: NgComponentOutlet;
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private get scroller(): HTMLElement | null { return this.element.nativeElement.closest('.app-content-container'); }
  private parentScroll = 0;
  private editor(): SongPatternWorkspaceComponent | undefined {
    const instance: unknown = this.outlet?.componentInstance;
    return instance instanceof SongPatternWorkspaceComponent ? instance : undefined;
  }
  async confirmNavigation(): Promise<boolean> { return await this.editor()?.canLeave() ?? true; }
  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.editor()?.hasUnsavedChanges()) { event.preventDefault(); event.returnValue = ''; }
  }
  async closeEditor(): Promise<void> {
    if (!await this.confirmNavigation()) return;
    this.finishEditor();
  }
  private finishEditor(): void {
    this.editorInjector.set(undefined);
    afterNextRender(() => {
      if (this.scroller) this.scroller.scrollTop = this.parentScroll;
      if (this.parentFocus instanceof HTMLElement && this.parentFocus.isConnected) this.parentFocus.focus({ preventScroll: true });
    }, { injector: this.injector });
  }
  @HostListener('window:resize')
  sizeWorkspace(): void {
    const scroller = this.scroller;
    const path = this.element.nativeElement.querySelector<HTMLElement>('.workspace-path');
    if (scroller && path) this.workspaceHeight.set(Math.max(0, scroller.clientHeight - 44 - path.offsetHeight - 12));
  }

  patternError(): string { return this.editor()?.error() ?? ''; }
  patternSaving(): boolean { return this.editor()?.saving() ?? false; }
  async savePattern(): Promise<void> { await this.editor()?.save(); }

  async editPattern(pattern: SongSheetPattern): Promise<void> { await this.openPatternEditor(pattern, false); }


  patternPlaybackState = { status: 'idle' } as PatternPlaybackState;
  private readonly patternPlayback = inject(PatternPlaybackService);
  private readonly songPartPlayback = inject(SongPartPlaybackService);
  private readonly songSheetService = inject(SongSheetsService);
  private readonly dialogService = inject(DialogService);
  private readonly modalService = inject(ModalService);
  private readonly notificationService = inject(NotificationService);
  private readonly patternPlaybackSubscription: Subscription;

  constructor() {
    this.patternPlaybackState = this.patternPlayback.getSnapshot();
    this.patternPlaybackSubscription = this.patternPlayback.state$.subscribe(state => {
      this.patternPlaybackState = state;
    });
  }

  ngOnDestroy(): void {
    this.patternPlaybackSubscription.unsubscribe();
  }

  async addPatterns(): Promise<void> {
    const choices: SongSheetChoice[] = [];
    if (this.sheet().patterns.length > 0) {
      choices.push({ value: 'create-new', text: 'Create new' });
    } else {
      choices.push({ value: 'create-new', text: 'Create first pattern' });
    }
    choices.push({ value: 'from-library', text: 'Import from library' });

    const choice = await this.openChoiceDialog({
      title: 'Add Pattern',
      choices
    });

    if (choice === 'from-library') {
      const importedPatterns = await this.importPatternsFromLibrary();
      if (importedPatterns.length > 0) {
        this.changed.emit();
      }
      return;
    }

    if (choice === 'create-new') {
      await this.openPatternEditor(createEmptySongSheetPattern(), true);
    }
  }

  async playPattern(pattern: SongSheetPattern): Promise<void> {
    try {
      this.songPartPlayback.stopMeasurePreview();
      this.songPartPlayback.stopSongPart();
      const tuning = this.sheet().tuning.map(note => transpose(note, this.sheet().capodaster));
      await this.patternPlayback.togglePatternPreview(pattern, tuning, undefined, this.sheet().tempo);
    } catch (error) {
      console.error('Error playing playing pattern:', error);
    }
  }

  async copyPattern(patternId: string): Promise<void> {
    const copy = await this.songSheetService.duplicatePattern(this.sheet().id, patternId, 'Copy');
    this.notificationService.success(`Copied pattern "${copy.name || 'Untitled Pattern'}"`);
    this.changed.emit();
  }

  async removePattern(patternId: string): Promise<void> {
    try {
      await this.songSheetService.removePattern(this.sheet().id, patternId);
      this.changed.emit();
    } catch (error) {
      await this.dialogService.alert(
        'This pattern is still used in a song part. Remove or change those part items first.',
        'Pattern In Use',
        'OK',
        { variant: 'warning' }
      );
    }
  }

  async dropPattern(event: CdkDragDrop<SongSheetPattern[]>): Promise<void> {
    if (event.previousIndex === event.currentIndex) {
      return;
    }

    moveItemInArray(this.sheet().patterns, event.previousIndex, event.currentIndex);
    await this.songSheetService.movePattern(this.sheet().id, event.previousIndex, event.currentIndex);
    this.changed.emit();
  }

  isPatternPlaybackActive(pattern: SongSheetPattern): boolean {
    return (this.patternPlaybackState.status === 'playing' || this.patternPlaybackState.status === 'preparing') && this.patternPlaybackState.patternId === pattern.id;
  }

  getPatternMeasureNotationContext(pattern: SongSheetPattern, measureIndex: number): PlayingActionsNotationContext {
    return {
      timeSignature: pattern.measures[measureIndex].timeSignature,
      actionGrips: (pattern.actionGrips ?? []).filter(grip => grip.measureIndex === measureIndex),
      gripById: buildGripByIdMap(this.sheet())
    };
  }

  getPatternMeasureNotationContexts(pattern: SongSheetPattern): PlayingActionsNotationContext[] {
    return pattern.measures.map((_, measureIndex) => this.getPatternMeasureNotationContext(pattern, measureIndex));
  }

  private async openChoiceDialog(context: SongSheetChoiceModalData): Promise<string | undefined> {
    const modalRef = this.modalService.show(SongSheetChoiceModalComponent, {
      data: context,
      width: '420px',
      maxWidth: '95vw',
      closeOnBackdropClick: true
    });

    return modalRef.afterClosed();
  }

  private async importPatternsFromLibrary(): Promise<SongSheetPattern[]> {
    const modalRef = this.modalService.show(PatternLibrarySelectorModalComponent, {
      data: { selectionMode: 'multiple' },
      width: '95vw',
      height: '90vh',
      maxHeight: '90vh',
      panelClass: 'modal-xl',
      closeOnBackdropClick: false
    });

    const result = await modalRef.afterClosed();
    if (!result) {
      return [];
    }

    const importedPatterns = result.patterns.map((pattern: PlayingPattern) => toSongSheetPattern(pattern));
    await this.songSheetService.addPatterns(importedPatterns, this.sheet().id);
    return importedPatterns;
  }

  private async openPatternEditor(pattern: SongSheetPattern, create: boolean): Promise<void> {
    if (!await this.confirmNavigation()) return;
    this.parentScroll = this.scroller?.scrollTop ?? window.scrollY;
    this.parentFocus = document.activeElement;
    this.editingName.set(create ? 'New pattern' : pattern.name || 'Untitled Pattern');
    const data: SongPatternWorkspaceData = {
      sheet: this.sheet(), pattern: cloneSongSheetPattern(pattern), create,
      save: async result => {
        if (create) await this.songSheetService.addPattern(cloneSongSheetPattern(result), this.sheet().id);
        else await this.songSheetService.updatePattern(this.sheet().id, result);
        this.changed.emit();
      }
    };
    const ref: ModalRef<SongSheetPattern | undefined> = { close: () => this.finishEditor(), afterClosed: async () => undefined };
    this.editorInjector.set(Injector.create({ parent: this.injector, providers: [
      { provide: MODAL_DATA, useValue: data }, { provide: MODAL_REF, useValue: ref }
    ] }));
    afterNextRender(() => {
      this.sizeWorkspace();
      const scroller = this.scroller;
      if (scroller) scroller.scrollTop += this.element.nativeElement.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 44;
      this.element.nativeElement.querySelector<HTMLInputElement>('#playingPatternName')?.focus({ preventScroll: true });
    }, { injector: this.injector });
  }
}
