import { Routes } from '@angular/router';
import { ChordViewerComponent } from 'app/components/chord-viewer/chord-viewer.component';
import { SongSheetsComponent } from './components/song-sheets/song-sheets.component';
import { SongSheetDetailComponent } from './components/song-sheets/song-sheet-detail/song-sheet-detail.component';
import { SettingsComponent } from './components/settings/settings.component';


export const routes: Routes = [
  { path: '', redirectTo: '/chord', pathMatch: 'full' },
  { path: 'chord/:chord', component: ChordViewerComponent },
  { path: 'chord', component: ChordViewerComponent },
  { path: 'song-sheets', component: SongSheetsComponent },
  { path: 'song-sheets/:id', component: SongSheetDetailComponent },
  { path: 'settings', component: SettingsComponent }
];
