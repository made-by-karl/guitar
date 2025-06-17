import { Routes } from '@angular/router';
import { ChordViewerComponent } from './components/chord-viewer/chord-viewer.component';

export const routes: Routes = [
  { path: '', redirectTo: '/chords', pathMatch: 'full' },
  { path: 'chords', component: ChordViewerComponent },
  { path: 'chord/:id', component: ChordViewerComponent }
];
