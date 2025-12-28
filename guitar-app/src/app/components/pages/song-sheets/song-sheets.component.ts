import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SongSheetsService } from '../../../services/song-sheets.service';
import { SongSheet } from '../../../services/song-sheets.model';
import { RouterLink, RouterOutlet } from '@angular/router';
import { DialogService } from 'app/services/dialog.service';

@Component({
  selector: 'app-song-sheets',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterOutlet],
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

  async load() {
    this.sheets = await this.service.getAll();
  }

  async createSheet() {
    if (this.newSheetName.trim()) {
      await this.service.create(this.newSheetName.trim());
      this.newSheetName = '';
      await this.load();
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
      await this.service.delete(id);
      await this.load();
    }
  }
}
