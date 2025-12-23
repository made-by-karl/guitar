import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RhythmPatternsService } from '../../../services/rhythm-patterns.service';
import { RhythmPattern } from '../../../services/rhythm-patterns.model';
import { PlaybackService } from '../../../services/playback.service';
import { SongSheetsService } from '../../../services/song-sheets.service';
import { DialogService } from '../../../services/dialog.service';
import { ModalService } from '../../../services/modal.service';
import { RhythmPatternEditorModalComponent } from '../../rhythm-pattern-editor-modal/rhythm-pattern-editor-modal.component';

@Component({
  selector: 'app-rhythm-patterns',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './rhythm-patterns.component.html',
  styleUrls: ['./rhythm-patterns.component.scss']
})
export class RhythmPatternsComponent {
  patterns: RhythmPattern[] = [];
  search = '';

  constructor(
    public service: RhythmPatternsService,
    private playback: PlaybackService,
    public songSheets: SongSheetsService,
    private dialogService: DialogService,
    private modalService: ModalService
  ) {
    this.load();
  }

  load() {
    this.patterns = this.service.getAll();
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
      this.onPatternSaved(result);
    }
  }

  private onPatternSaved(pattern: RhythmPattern) {
    // Check if this is a new pattern (not in our patterns array yet)
    const existingPatternIndex = this.patterns.findIndex(p => p.id === pattern.id);
    
    if (existingPatternIndex === -1) {
      // New pattern - add it
      this.service.add(pattern);
      this.patterns.push(pattern);
    } else {
      // Existing pattern - update it
      this.service.update(pattern);
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

  get pinnedSheet() {
    return this.songSheets.getPinnedSongSheet();
  }

  async playPattern(pattern: RhythmPattern) {
    if (!pattern.measures || pattern.measures.length === 0) {
      console.error('Pattern has no measures:', pattern);
      return;
    }
    
    // Use the new MIDI service to play the entire rhythm pattern
    try {
      await this.playback.playRhythmPattern(pattern);
    } catch (error) {
      console.error('Error playing rhythm pattern:', error);
    }
  }

  addToPinnedSheet(pattern: RhythmPattern) {
    const pinned = this.pinnedSheet;
    if (!pinned) return;
    // Check if pattern is already in the sheet
    const songSheet = this.songSheets.getById(pinned.id);
    const already = songSheet?.patterns?.find(p => p.patternId === pattern.id);
    if (already) return;
    
    this.songSheets.addPattern({
      patternId: pattern.id
    });
    this.songSheets.getById(pinned.id); // refresh
  }

  removeFromPinnedSheet(pattern: RhythmPattern) {
    const pinned = this.pinnedSheet;
    if (!pinned) return;
    
    const songSheet = this.songSheets.getById(pinned.id);
    const entry = songSheet?.patterns?.find(p => p.patternId === pattern.id);
    if (entry) {
      this.songSheets.removePattern(pinned.id, entry.patternId);
      this.songSheets.getById(pinned.id); // refresh
    }
  }

  isPatternInPinnedSheet(pattern: RhythmPattern): boolean {
    const pinned = this.pinnedSheet;
    if (!pinned) return false;
    
    const songSheet = this.songSheets.getById(pinned.id);
    return !!(songSheet?.patterns?.some(p => p.patternId === pattern.id));
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
      this.service.delete(pattern.id);
      this.load();
    }
  }
}
