import { Routes } from '@angular/router';
import { MetronomeComponent } from '@/app/features/metronome/pages/metronome-page/metronome.component';
import { SettingsComponent } from '@/app/features/maintenance/settings/pages/settings.component';
import { MidiTestComponent } from '@/app/features/maintenance/midi-test/pages/midi-test.component';
import { PatternsLibraryComponent } from '@/app/features/patterns/pages/patterns-library/patterns-library.component';
import { PatternsEditorComponent } from '@/app/features/patterns/pages/patterns-editor/patterns-editor.component';
import { SheetsListComponent } from '@/app/features/sheets/pages/sheets-list/sheets-list.component';
import { SongSheetComponent } from '@/app/features/sheets/pages/song-sheet/song-sheet.component';
import { ChordComponent } from '@/app/features/grips/pages/grips-page/chord.component';


export const routes: Routes = [
  { path: '', redirectTo: '/sheets', pathMatch: 'full' },
  { path: 'grips/:chord', component: ChordComponent },
  { path: 'grips', component: ChordComponent },
  { path: 'sheets', component: SheetsListComponent },
  { path: 'sheets/:id', component: SongSheetComponent },
  { path: 'patterns', component: PatternsLibraryComponent },
  { path: 'patterns/editor', component: PatternsEditorComponent },
  { path: 'metronome', component: MetronomeComponent },
  { path: 'maintenance/midi-test', component: MidiTestComponent },
  { path: 'maintenance/settings', component: SettingsComponent }
];
