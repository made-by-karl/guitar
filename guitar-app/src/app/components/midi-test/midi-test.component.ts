import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlaybackService } from '../../services/playback.service';
import { MidiTechnique } from '../../services/midi.model';

@Component({
  selector: 'app-midi-test',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container mt-4">
      <h2>🎸 Guitar MIDI Test</h2>
      <p class="text-muted">Test different guitar playing techniques and sounds</p>
      
      <div class="row">
        <div class="col-md-6">
          <div class="card">
            <div class="card-header">
              <h5>Basic Chord Playback</h5>
            </div>
            <div class="card-body">
              <button class="btn btn-primary me-2 mb-2" (click)="playChord(['E4', 'G#4', 'B4'])">
                E Major Triad
              </button>
              <button class="btn btn-primary me-2 mb-2" (click)="playChord(['C4', 'E4', 'G4'])">
                C Major Triad
              </button>
              <button class="btn btn-primary me-2 mb-2" (click)="playChord(['A3', 'C4', 'E4'])">
                A Minor Triad
              </button>
            </div>
          </div>
        </div>
        
        <div class="col-md-6">
          <div class="card">
            <div class="card-header">
              <h5>Playing Techniques</h5>
            </div>
            <div class="card-body">
              <button class="btn btn-success me-2 mb-2" (click)="playTechnique('normal')">
                🎸 Normal
              </button>
              <button class="btn btn-warning me-2 mb-2" (click)="playTechnique('muted')">
                🔇 Muted
              </button>
              <button class="btn btn-info me-2 mb-2" (click)="playTechnique('palm-muted')">
                🤚 Palm Muted
              </button>
              <button class="btn btn-secondary me-2 mb-2" (click)="playTechnique('percussive')">
                🥁 Percussive
              </button>
              <button class="btn btn-danger me-2 mb-2" (click)="playTechnique('accented')">
                ⚡ Accented
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <div class="row mt-4">
        <div class="col-12">
          <div class="card">
            <div class="card-header">
              <h5>Guitar String Test</h5>
            </div>
            <div class="card-body">
              <p class="text-muted">Test individual guitar strings (open strings)</p>
              <button class="btn btn-outline-primary me-2" (click)="playString(0)">
                Low E (6th)
              </button>
              <button class="btn btn-outline-primary me-2" (click)="playString(1)">
                A (5th)
              </button>
              <button class="btn btn-outline-primary me-2" (click)="playString(2)">
                D (4th)
              </button>
              <button class="btn btn-outline-primary me-2" (click)="playString(3)">
                G (3rd)
              </button>
              <button class="btn btn-outline-primary me-2" (click)="playString(4)">
                B (2nd)
              </button>
              <button class="btn btn-outline-primary me-2" (click)="playString(5)">
                High E (1st)
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <div class="row mt-4" *ngIf="status">
        <div class="col-12">
          <div class="alert alert-info">
            <strong>Status:</strong> {{ status }}
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .btn {
      min-width: 120px;
    }
    .card {
      height: 100%;
    }
  `]
})
export class MidiTestComponent {
  status: string = '';

  // Standard guitar tuning (open strings)
  private openStrings = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];

  constructor(private playbackService: PlaybackService) {}

  async playChord(notes: string[]) {
    try {
      this.status = `Playing chord: ${notes.join(', ')}`;
      await this.playbackService.playChordFromNotes(notes, 2.0, 0.7, 'normal');
      this.status = 'Chord finished playing';
    } catch (error) {
      this.status = `Error playing chord: ${error}`;
      console.error('Error playing chord:', error);
    }
  }

  async playTechnique(technique: MidiTechnique) {
    try {
      // Play a C major chord with the specified technique
      const chordNotes = ['C4', 'E4', 'G4'];
      this.status = `Playing C major chord with ${technique} technique`;
      
      await this.playbackService.playChordFromNotes(chordNotes, 1.5, 0.7, technique);
      this.status = `${technique} technique finished playing`;
    } catch (error) {
      this.status = `Error playing ${technique}: ${error}`;
      console.error(`Error playing ${technique}:`, error);
    }
  }

  async playString(stringIndex: number) {
    try {
      const note = this.openStrings[stringIndex];
      const stringName = ['Low E (6th)', 'A (5th)', 'D (4th)', 'G (3rd)', 'B (2nd)', 'High E (1st)'][stringIndex];
      
      this.status = `Playing ${stringName} string: ${note}`;
      await this.playbackService.playChordFromNotes([note], 2.0, 0.7, 'normal');
      this.status = `${stringName} string finished playing`;
    } catch (error) {
      this.status = `Error playing string: ${error}`;
      console.error('Error playing string:', error);
    }
  }
}
