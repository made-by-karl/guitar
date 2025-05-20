import { Routes } from '@angular/router';
import { ChordLibraryComponent } from './components/chord-library/chord-library.component';
import { ChordViewerComponent } from './components/chord-viewer/chord-viewer.component';

export const routes: Routes = [
  { path: '', redirectTo: '/chords', pathMatch: 'full' },
  { path: 'chords', component: ChordLibraryComponent },
  { path: 'chord/:id', component: ChordViewerComponent }
];
