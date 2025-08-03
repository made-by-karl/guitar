import { Component } from '@angular/core';
import { CommonModule, NgForOf, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SongSheetsService } from '../../services/song-sheets.service';
import { SongSheet } from '../../services/song-sheets.model';
import { RouterLink, RouterOutlet } from '@angular/router';
import { DialogService } from 'app/services/dialog.service';

@Component({
  selector: 'app-song-sheets',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterOutlet, NgForOf, NgIf],
  templateUrl: './song-sheets.component.html',
  styleUrls: ['./song-sheets.component.scss']
})
export class SongSheetsComponent {
  sheets: SongSheet[] = [];
  newSheetName = '';

  constructor(
    private service: SongSheetsService,
    private dialogService: DialogService
  ) {
    this.load();
  }

  load() {
    this.sheets = this.service.getAll();
  }

  createSheet() {
    if (this.newSheetName.trim()) {
      this.service.create(this.newSheetName.trim());
      this.newSheetName = '';
      this.load();
    }
  }

  async deleteSheet(id: string) {
    const confirmed = await this.dialogService.confirm(
      'Are you sure you want to delete this song sheet?',
      'Delete Song Sheet',
      'Delete',
      'Cancel',
      { variant: 'danger' }
    );

    if (confirmed) {
      this.service.delete(id);
      this.load();
    }
  }
}
