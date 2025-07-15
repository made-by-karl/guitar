import { Component } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { CommonModule, NgIf, NgForOf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SongSheetsService } from './services/song-sheets.service';
import { SongSheet } from './services/song-sheets.model';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, CommonModule, NgIf, NgForOf, FormsModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'My Guitar Sheets';
  isNavbarCollapsed = true;

  constructor(public songSheetsService: SongSheetsService) {}

  get pinnedSongSheet(): SongSheet | undefined {
    return this.songSheetsService.getPinnedSongSheet();
  }

  get pinnedSheetId(): string | null {
    return this.pinnedSongSheet?.id ?? null;
  }
  set pinnedSheetId(id: string | null) {
    if (id) {
      this.songSheetsService.pinSongSheet(id);
    } else {
      this.songSheetsService.unpinSongSheet();
    }
  }

  onPinnedSheetChange(id: string | null) {
    this.pinnedSheetId = id;
  }
}
