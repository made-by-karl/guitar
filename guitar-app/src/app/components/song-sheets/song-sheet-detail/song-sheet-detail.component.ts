import { Component } from '@angular/core';
import { CommonModule, NgForOf, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SongSheetsService } from '../../../services/song-sheets.service';
import { SongSheet, SongSheetGrip, SongSheetPattern } from '../../../services/song-sheets.model';
import { GripDiagramComponent } from '../../grip-diagram/grip-diagram.component';
import { PlaybackService } from '../../../services/playback.service';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-song-sheet-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, GripDiagramComponent, NgForOf, NgIf],
  templateUrl: './song-sheet-detail.component.html',
  styleUrls: ['./song-sheet-detail.component.scss']
})
export class SongSheetDetailComponent {
  sheet: SongSheet | undefined;
  renaming = false;
  tempName = '';

  constructor(
    private service: SongSheetsService,
    private playback: PlaybackService,
    private route: ActivatedRoute
  ) {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.sheet = this.service.getById(id);
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
      this.service.update(this.sheet);
    }
    this.renaming = false;
  }

  cancelRename() {
    this.renaming = false;
    this.tempName = '';
  }

  removeGrip(gripId: string) {
    if (this.sheet) {
      this.service.removeGrip(this.sheet.id, gripId);
      this.sheet = this.service.getById(this.sheet.id);
    }
  }

  removePattern(patternId: string) {
    if (this.sheet) {
      this.service.removePattern(this.sheet.id, patternId);
      this.sheet = this.service.getById(this.sheet.id);
    }
  }

  async playGrip(grip: SongSheetGrip) {
    try {
      // Use the pre-calculated notes from TunedGrip if available
      // Filter out muted strings (null notes)
      const notes = grip.grip.notes?.filter((note: string | null) => note !== null) as string[] || [];
      
      if (notes.length > 0) {
        await this.playback.playChordFromNotes(notes);
      } else {
        console.warn('No playable notes found in grip');
      }
    } catch (error) {
      console.error('Error playing grip:', error);
    }
  }

  async playPattern(pattern: any) {
    if (!pattern.steps) {
      console.error('Pattern has no steps:', pattern);
      return;
    }
    
    // Use the new MIDI service to play the entire rhythm pattern
    try {
      await this.playback.playRhythmPattern(pattern);
    } catch (error) {
      console.error('Error playing rhythm pattern:', error);
    }
  }
}
