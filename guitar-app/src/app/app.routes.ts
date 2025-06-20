import { Routes } from '@angular/router';
import { ChordViewerComponent } from 'app/components/chord-viewer/chord-viewer.component';

export const routes: Routes = [
  { path: '', redirectTo: '/chord', pathMatch: 'full' },
  { path: 'chord/:chord', component: ChordViewerComponent },
  { path: 'chord', component: ChordViewerComponent }
];
