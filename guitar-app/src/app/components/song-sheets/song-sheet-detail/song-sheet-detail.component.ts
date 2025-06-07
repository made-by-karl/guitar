import { Component } from '@angular/core';
import { CommonModule, NgForOf, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SongSheetsService } from '../../../services/song-sheets.service';
import { SongSheet, SongSheetGrip } from '../../../services/song-sheets.model';
import { GripDiagramComponent } from '../../grip-diagram/grip-diagram.component';
import { MidiService } from '../../../services/midi.service';
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
    private midi: MidiService,
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

  playGrip(grip: SongSheetGrip) {
    const positions = grip.grip.frets.map((f: any) => f === 'x' ? 'x' : f.toString());
    this.midi.generateAndPlayChord(positions);
  }
}
