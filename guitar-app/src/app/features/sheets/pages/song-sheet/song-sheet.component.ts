import { Component, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { SongSheetsService } from '@/app/features/sheets/services/song-sheets.service';
import { SongSheetLink, SongSheetWithData } from '@/app/features/sheets/services/song-sheets.model';
import { PatternPlaybackService } from '@/app/features/patterns/services/pattern-playback.service';
import { SongPartPlaybackService } from '@/app/features/sheets/services/song-part-playback.service';
import { Note, SEMITONES, Semitone } from '@/app/core/music/semitones';
import { ModalService } from '@/app/core/services/modal.service';
import { SongPartsTabComponent } from './song-parts-tab/song-parts-tab.component';
import { SongGripsTabComponent } from './song-grips-tab/song-grips-tab.component';
import { SongPatternsTabComponent } from './song-patterns-tab/song-patterns-tab.component';
import { SongTuningEditorComponent } from './song-tuning-editor/song-tuning-editor.component';
import { SongSheetLinkEditorModalComponent } from './song-sheet-link-editor-modal.component';
import { SongArrangementComponent } from './song-arrangement/song-arrangement.component';

type SongSheetTab = 'song' | 'parts' | 'grips' | 'patterns' | 'tuning' | 'links';

@Component({
  selector: 'app-song-sheet',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SongPartsTabComponent,
    SongArrangementComponent,
    SongGripsTabComponent,
    SongPatternsTabComponent,
    SongTuningEditorComponent
  ],
  templateUrl: './song-sheet.component.html',
  styleUrls: ['./song-sheet.component.scss']
})
export class SongSheetComponent implements OnDestroy {
  readonly tabs: ReadonlyArray<{ id: SongSheetTab; label: string; icon: string }> = [
    { id: 'song', label: 'Song', icon: 'bi-music-note-list' },
    { id: 'parts', label: 'Parts', icon: 'bi-list-ol' },
    { id: 'grips', label: 'Grips', icon: 'bi-grid-3x3-gap' },
    { id: 'patterns', label: 'Patterns', icon: 'bi-arrow-down-up' },
    { id: 'tuning', label: 'Tempo & Tuning', icon: 'bi-sliders' },
    { id: 'links', label: 'Links', icon: 'bi-link-45deg' }
  ];

  sheet: SongSheetWithData | undefined;
  renaming = false;
  tempName = '';
  tempTuning: Note[] = [];
  tempCapodaster = 0;
  tempTempo = 80;
  activeTab: SongSheetTab = 'song';
  @ViewChild(SongArrangementComponent) private arrangement?: SongArrangementComponent;

  readonly semitones: Semitone[] = [...SEMITONES];
  readonly octaves = [1, 2, 3, 4, 5, 6];

  constructor(
    private readonly songSheetService: SongSheetsService,
    private readonly songPartPlayback: SongPartPlaybackService,
    private readonly patternPlayback: PatternPlaybackService,
    private readonly route: ActivatedRoute,
    private readonly modalService: ModalService
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
    this.songPartPlayback.stopSong();
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

  async saveTuning(): Promise<void> {
    if (!this.sheet) {
      return;
    }

    const updatedSheet = {
      ...this.sheet,
      tuning: this.tempTuning.map(note => ({ ...note })),
      capodaster: this.tempCapodaster,
      tempo: this.tempTempo
    };
    await this.songSheetService.update(updatedSheet);
    this.sheet = updatedSheet;
  }

  async selectTab(tab: SongSheetTab): Promise<void> {
    if (tab !== this.activeTab && !await this.canDeactivate()) return;
    this.activeTab = tab;
  }

  async canDeactivate(): Promise<boolean> {
    return await this.arrangement?.confirmNavigation() ?? true;
  }

  async onTabKeydown(event: KeyboardEvent, tabIndex: number): Promise<void> {
    let nextIndex: number;
    switch (event.key) {
      case 'ArrowRight': nextIndex = (tabIndex + 1) % this.tabs.length; break;
      case 'ArrowLeft': nextIndex = (tabIndex + this.tabs.length - 1) % this.tabs.length; break;
      case 'Home': nextIndex = 0; break;
      case 'End': nextIndex = this.tabs.length - 1; break;
      default: return;
    }

    event.preventDefault();
    const target = event.currentTarget;
    await this.selectTab(this.tabs[nextIndex].id);
    if (this.activeTab === this.tabs[nextIndex].id && target instanceof HTMLElement) {
      target.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
    }
  }

  async startAddingLink(): Promise<void> {
    await this.openLinkEditorDialog();
  }

  async startEditingLink(link: SongSheetLink): Promise<void> {
    await this.openLinkEditorDialog(link);
  }

  async removeLink(linkId: string): Promise<void> {
    if (!this.sheet) {
      return;
    }

    this.sheet = {
      ...this.sheet,
      links: this.sheet.links.filter(link => link.id !== linkId)
    };
    await this.songSheetService.update(this.sheet);

  }

  getLinkDisplayLabel(url: string): string {
    const parsed = this.tryParseUrl(url);
    if (!parsed) {
      return url;
    }

    const hostname = parsed.hostname.replace(/^www\./, '');
    const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
    return path ? hostname + path : hostname;
  }

  getLinkText(link: SongSheetLink): string {
    const description = link.description.trim();
    return description.length > 0 ? description : this.getLinkDisplayLabel(link.url);
  }

  private async loadSheet(id: string): Promise<void> {
    this.sheet = await this.songSheetService.getByIdWithData(id);
    this.resetTuningDraft();
  }

  private resetTuningDraft(): void {
    if (!this.sheet) {
      return;
    }

    this.tempTuning = this.sheet.tuning.map(note => ({ ...note }));
    this.tempCapodaster = this.sheet.capodaster;
    this.tempTempo = this.sheet.tempo;
  }

  private async openLinkEditorDialog(link?: SongSheetLink): Promise<void> {
    if (!this.sheet) {
      return;
    }

    const modalRef = this.modalService.show(SongSheetLinkEditorModalComponent, {
      width: '640px',
      maxWidth: '95vw',
      closeOnBackdropClick: false,
      data: {
        title: link ? 'Edit Link' : 'Add Link',
        link: link ? { url: link.url, description: link.description } : null
      }
    });

    const result = await modalRef.afterClosed();
    if (!result) {
      return;
    }

    const nextLink: SongSheetLink = {
      id: link?.id ?? this.createLinkId(),
      url: result.url,
      description: result.description
    };

    this.sheet = {
      ...this.sheet,
      links: link
        ? this.sheet.links.map(existing => existing.id === link.id ? nextLink : existing)
        : [...this.sheet.links, nextLink]
    };
    await this.songSheetService.update(this.sheet);
  }

  private tryParseUrl(value: string): URL | null {
    try {
      return new URL(value);
    } catch {
      return null;
    }
  }

  private createLinkId(): string {
    return 'ssl-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  }
}
