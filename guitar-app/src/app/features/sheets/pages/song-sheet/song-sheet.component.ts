import { Component, OnDestroy, TemplateRef, ViewChild, ViewContainerRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { SongSheetsService } from '@/app/features/sheets/services/song-sheets.service';
import { SongSheetWithData } from '@/app/features/sheets/services/song-sheets.model';
import { PatternPlaybackService } from '@/app/features/patterns/services/pattern-playback.service';
import { SongPartPlaybackService } from '@/app/features/sheets/services/song-part-playback.service';
import { Note, SEMITONES, Semitone } from '@/app/core/music/semitones';
import { TypedContextDirective } from '@/app/core/ui/directives/typed-context.directive';
import { ModalRef, ModalService } from '@/app/core/services/modal.service';
import { SongPartsTabComponent } from './song-parts-tab/song-parts-tab.component';
import { SongGripsTabComponent } from './song-grips-tab/song-grips-tab.component';
import { SongPatternsTabComponent } from './song-patterns-tab/song-patterns-tab.component';
import { SongTuningEditorComponent } from './song-tuning-editor/song-tuning-editor.component';

type SongSheetTab = 'parts' | 'grips' | 'patterns';

interface TuningEditorModalTemplateContext {
  $implicit: null;
  data: null;
  modalRef: ModalRef<void>;
}

@Component({
  selector: 'app-song-sheet',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TypedContextDirective,
    SongPartsTabComponent,
    SongGripsTabComponent,
    SongPatternsTabComponent,
    SongTuningEditorComponent
  ],
  templateUrl: './song-sheet.component.html',
  styleUrls: ['./song-sheet.component.scss']
})
export class SongSheetComponent implements OnDestroy {
  @ViewChild('tuningEditorModal') tuningEditorModalTemplate!: TemplateRef<TuningEditorModalTemplateContext>;

  sheet: SongSheetWithData | undefined;
  renaming = false;
  tempName = '';
  tempTuning: Note[] = [];
  tempCapodaster = 0;
  tempTempo = 80;
  activeTab: SongSheetTab = 'parts';

  readonly semitones: Semitone[] = [...SEMITONES];
  readonly octaves = [1, 2, 3, 4, 5, 6];
  readonly tuningEditorTemplateType = {} as TuningEditorModalTemplateContext;

  constructor(
    private readonly songSheetService: SongSheetsService,
    private readonly songPartPlayback: SongPartPlaybackService,
    private readonly patternPlayback: PatternPlaybackService,
    private readonly route: ActivatedRoute,
    private readonly modalService: ModalService,
    private readonly viewContainerRef: ViewContainerRef
  ) {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadSheet(id);
    }
  }

  ngOnDestroy(): void {
    this.patternPlayback.stopPatternPreview();
    this.songPartPlayback.stopMeasurePreview();
    this.songPartPlayback.stopSongPart();
  }

  async refreshData(): Promise<void> {
    if (!this.sheet) {
      return;
    }

    await this.loadSheet(this.sheet.id);
  }

  startRenaming(): void {
    if (!this.sheet) {
      return;
    }

    this.tempName = this.sheet.name;
    this.renaming = true;
  }

  async saveRename(): Promise<void> {
    if (!this.sheet) {
      return;
    }

    this.sheet.name = this.tempName;
    await this.songSheetService.update(this.sheet);
    this.renaming = false;
  }

  cancelRename(): void {
    this.renaming = false;
    this.tempName = '';
  }

  async showTuning(): Promise<void> {
    if (!this.sheet) {
      return;
    }

    this.tempTuning = [...this.sheet.tuning];
    this.tempCapodaster = this.sheet.capodaster;
    this.tempTempo = this.sheet.tempo;
    await this.openTuningEditorDialog();
  }

  async saveTuning(modalRef?: ModalRef<void>): Promise<void> {
    if (!this.sheet) {
      return;
    }

    this.sheet.tuning = [...this.tempTuning];
    this.sheet.capodaster = this.tempCapodaster;
    this.sheet.tempo = this.tempTempo;
    await this.songSheetService.update(this.sheet);
    modalRef?.close();
  }

  cancelTuning(modalRef?: ModalRef<void>): void {
    modalRef?.close();
  }

  selectTab(tab: SongSheetTab): void {
    this.activeTab = tab;
  }

  getTuningDisplay(): string {
    if (!this.sheet) {
      return '';
    }

    return this.sheet.tuning.map(note => `${note.semitone}${note.octave}`).join(' | ');
  }

  private async loadSheet(id: string): Promise<void> {
    this.sheet = await this.songSheetService.getByIdWithData(id);
  }

  private async openTuningEditorDialog(): Promise<void> {
    if (!this.tuningEditorModalTemplate) {
      return;
    }

    const modalRef = this.modalService.showTemplate<void, null>(
      this.tuningEditorModalTemplate,
      this.viewContainerRef,
      {
        data: null,
        width: '720px',
        maxWidth: '95vw',
        closeOnBackdropClick: false
      }
    );

    await modalRef.afterClosed();
  }
}
