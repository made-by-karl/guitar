import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SongSheetsService } from '../../../services/song-sheets.service';
import { SongSheetWithData, SongSheetGripWithData, SongSheetPatternWithData, SongPart, SongSheetPattern, SongSheetGrip } from '../../../services/song-sheets.model';
import { GripDiagramComponent } from '../../grip-diagram/grip-diagram.component';
import { PlaybackService } from '../../../services/playback.service';
import { ActivatedRoute, Router } from '@angular/router';
import { GripService } from 'app/services/grips/grip.service';
import { Note, SEMITONES, Semitone, transpose } from 'app/common/semitones';

@Component({
  selector: 'app-song-sheet-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, GripDiagramComponent],
  templateUrl: './song-sheet-detail.component.html',
  styleUrls: ['./song-sheet-detail.component.scss']
})
export class SongSheetDetailComponent {
  sheet: SongSheetWithData | undefined;
  renaming = false;
  tempName = '';
  showTuningForm = false;
  
  // For editing song parts
  editingPartIndex: number | null = null;
  showAddPartForm = false;
  tempPartSection = '';
  tempPartPatterns: {
    pattern: SongSheetPattern,
    grips: { grip: SongSheetGrip, startBeat: number }[]
  }[] = [];
  
  // For tuning form
  readonly semitones: Semitone[] = [...SEMITONES];
  readonly octaves = [1, 2, 3, 4, 5, 6];
  
  // Temporary tuning values for form
  tempTuning: Note[] = [];
  tempCapodaster = 0;
  tempTempo = 80;

  constructor(
    private songSheetService: SongSheetsService,
    private playback: PlaybackService,
    private gripService: GripService,
    private route: ActivatedRoute,
    private router: Router
  ) {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.sheet = this.songSheetService.getByIdWithData(id);
    }
  }

  startRenaming() {
    if (this.sheet) {
      this.tempName = this.sheet.name;
      this.renaming = true;
    }
  }

  saveRename() {
    if (this.sheet) {
      this.sheet.name = this.tempName;
      this.songSheetService.update(this.sheet);
    }
    this.renaming = false;
  }

  cancelRename() {
    this.renaming = false;
    this.tempName = '';
  }

  showTuning() {
    if (this.sheet) {
      this.tempTuning = [...this.sheet.tuning];
      this.tempCapodaster = this.sheet.capodaster;
      this.tempTempo = this.sheet.tempo;
      this.showTuningForm = true;
    }
  }

  saveTuning() {
    if (this.sheet) {
      this.sheet.tuning = [...this.tempTuning];
      this.sheet.capodaster = this.tempCapodaster;
      this.sheet.tempo = this.tempTempo;
      this.songSheetService.update(this.sheet);
    }
    this.showTuningForm = false;
  }

  cancelTuning() {
    this.showTuningForm = false;
  }

  removeGrip(gripId: string) {
    if (this.sheet) {
      this.songSheetService.removeGrip(this.sheet.id, gripId);
      this.sheet = this.songSheetService.getByIdWithData(this.sheet.id);
    }
  }

  removePattern(patternId: string) {
    if (this.sheet) {
      this.songSheetService.removePattern(this.sheet.id, patternId);
      this.sheet = this.songSheetService.getById(this.sheet.id);
      if (this.sheet) {
        this.sheet = this.songSheetService.getByIdWithData(this.sheet.id);
      }
    }
  }

  async playGrip(grip: SongSheetGripWithData) {
    if (!this.sheet || !grip.grip) return;

    try {
      const tuning = this.sheet.tuning.map(note => transpose(note, this.sheet!.capodaster));
      const tunedGrip = this.gripService.toTunedGrip(grip.grip, tuning);
      const notes = tunedGrip.notes.filter(note => note !== null);

      if (notes.length > 0) {
        await this.playback.playChordFromNotes(notes);
      } else {
        console.warn('No playable notes found in grip');
      }
    } catch (error) {
      console.error('Error playing grip:', error);
    }
  }

  async playPattern(pattern: SongSheetPatternWithData) {
    if (!this.sheet || !pattern.pattern) return;

    if (!pattern.pattern.steps) {
      console.error('Pattern has no steps:', pattern);
      return;
    }
    
    // Use the MIDI service to play the entire rhythm pattern
    try {
      const tuning = this.sheet.tuning.map(note => transpose(note, this.sheet!.capodaster));
      await this.playback.playRhythmPattern(pattern.pattern, tuning, undefined, this.sheet.tempo);
    } catch (error) {
      console.error('Error playing rhythm pattern:', error);
    }
  }

  // Song parts management
  showAddPart() {
    this.showAddPartForm = true;
    this.resetPartForm();
  }

  startEditingPart(partIndex: number) {
    if (!this.sheet || !this.sheet.parts) return;
    
    const part = this.sheet.parts[partIndex];
    this.editingPartIndex = partIndex;
    this.tempPartSection = part.section;
    this.tempPartPatterns = part.patterns.map(p => ({ 
      pattern: { patternId: p.pattern.patternId },
      grips: p.grips.map(g => ({ 
        grip: { gripId: g.grip.gripId, chordName: g.grip.chordName },
        startBeat: g.startBeat 
      }))
    }));
  }

  savePartEdit() {
    if (!this.sheet || this.editingPartIndex === null) return;

    const part: SongPart = {
      section: this.tempPartSection,
      patterns: this.tempPartPatterns
    };

    this.songSheetService.updatePart(this.sheet.id, this.editingPartIndex, part);
    this.cancelPartEdit();
    this.refreshData();
  }

  addNewPart() {
    if (!this.sheet || !this.tempPartSection.trim()) return;

    const part: SongPart = {
      section: this.tempPartSection.trim(),
      patterns: this.tempPartPatterns
    };

    this.songSheetService.addPart(this.sheet.id, part);
    this.cancelPartEdit();
    this.refreshData();
  }

  removePart(partIndex: number) {
    if (!this.sheet) return;
    
    if (confirm('Are you sure you want to remove this song part?')) {
      this.songSheetService.removePart(this.sheet.id, partIndex);
      this.refreshData();
    }
  }

  cancelPartEdit() {
    this.editingPartIndex = null;
    this.showAddPartForm = false;
    this.resetPartForm();
  }

  private resetPartForm() {
    this.tempPartSection = '';
    this.tempPartPatterns = [];
  }

  addPatternToPart() {
    this.tempPartPatterns.push({ 
      pattern: { patternId: '' },
      grips: []
    });
  }

  removePatternFromPart(index: number) {
    this.tempPartPatterns.splice(index, 1);
  }

  addGripToPattern(patternIndex: number) {
    this.tempPartPatterns[patternIndex].grips.push({ 
      grip: { gripId: '', chordName: '' }, 
      startBeat: 1 
    });
  }

  removeGripFromPattern(patternIndex: number, gripIndex: number) {
    this.tempPartPatterns[patternIndex].grips.splice(gripIndex, 1);
  }

  updateGripChordName(patternIndex: number, gripIndex: number, gripId: string) {
    if (!this.sheet) return;
    const grip = this.sheet.grips.find(g => g.gripId === gripId);
    if (grip) {
      this.tempPartPatterns[patternIndex].grips[gripIndex].grip.chordName = grip.chordName;
    }
  }

  private refreshData() {
    if (!this.sheet) return;
    this.sheet = this.songSheetService.getByIdWithData(this.sheet.id);
  }

  getPatternName(patternId: string): string {
    if (!this.sheet) return 'Unknown Pattern';
    const pattern = this.sheet.patterns.find(p => p.patternId === patternId);
    return pattern?.pattern?.name || 'Unknown Pattern';
  }

  getTuningDisplay(): string {
    if (!this.sheet) return '';
    return this.sheet.tuning.map(note => `${note.semitone}${note.octave}`).join(' - ');
  }

  addChords() {
    if (this.sheet) {
      this.songSheetService.pinSongSheet(this.sheet.id);
      this.router.navigate(['/chord']);
    }
  }

  addPatterns() {
    if (this.sheet) {
      this.songSheetService.pinSongSheet(this.sheet.id);
      this.router.navigate(['/rhythm-patterns']);
    }
  }
}
