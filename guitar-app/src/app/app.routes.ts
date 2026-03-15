import { Routes } from '@angular/router';
import { ChordComponent } from '@/app/components/pages/chord/chord.component';
import { SongSheetsComponent } from '@/app/components/pages/song-sheets/song-sheets.component';
import { SongSheetDetailComponent } from '@/app/components/pages/song-sheet-detail/song-sheet-detail.component';
import { SettingsComponent } from '@/app/components/pages/settings/settings.component';
import { RhythmPatternsComponent } from '@/app/components/pages/rhythm-patterns/rhythm-patterns.component';
import { MidiTestComponent } from '@/app/components/pages/midi-test/midi-test.component';
import { MetronomeComponent } from '@/app/components/pages/metronome/metronome.component';


export const routes: Routes = [
  { path: '', redirectTo: '/song-sheets', pathMatch: 'full' },
  { path: 'chord/:chord', component: ChordComponent },
  { path: 'chord', component: ChordComponent },
  { path: 'song-sheets', component: SongSheetsComponent },
  { path: 'song-sheets/:id', component: SongSheetDetailComponent },
  { path: 'rhythm-patterns', component: RhythmPatternsComponent },
  { path: 'metronome', component: MetronomeComponent },
  { path: 'midi-test', component: MidiTestComponent },
  { path: 'settings', component: SettingsComponent }
];
