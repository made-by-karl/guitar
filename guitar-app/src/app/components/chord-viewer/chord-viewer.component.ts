import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ChordService, Chord, ChordVariation } from '../../services/chord.service';

@Component({
  selector: 'app-chord-viewer',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './chord-viewer.component.html',
  styleUrls: ['./chord-viewer.component.scss']
})
export class ChordViewerComponent implements OnInit {
  chord: Chord | null = null;
  selectedVariation: ChordVariation | null = null;
  fretboardHeight = 5;
  strings = 6;

  constructor(
    private route: ActivatedRoute,
    private chordService: ChordService
  ) {}

  ngOnInit() {
    const chordId = this.route.snapshot.paramMap.get('id');
    if (chordId) {
      this.chord = this.chordService.getChordById(chordId) || null;
      if (this.chord && this.chord.variations.length > 0) {
        this.selectedVariation = this.chord.variations[0];
      }
    }
  }

  playChord() {
    if (this.chord) {
      this.chordService.playChord(this.chord.id);
    }
  }

  parseInt(value: string): number {
    return parseInt(value);
  }

  getFingerAtPosition(string: number, fret: number): string | null {
    if (!this.selectedVariation) return null;
    
    // Convert 1-based string number to 0-based index (reversed)
    const stringIndex = 6 - string;
    
    if (this.selectedVariation.positions[stringIndex] === 'x') return null;
    if (parseInt(this.selectedVariation.positions[stringIndex]) !== fret) return null;
    
    return this.selectedVariation.fingerings[0][stringIndex];
  }

  isBarreFret(fret: number): boolean {
    if (!this.selectedVariation?.fingerings[0]) return false;
    
    // Count how many times each finger number appears
    const fingerCounts = new Map<string, number>();
    this.selectedVariation.fingerings[0].forEach(finger => {
      if (finger !== '0') {
        fingerCounts.set(finger, (fingerCounts.get(finger) || 0) + 1);
      }
    });

    // Check if any finger is used more than once at this fret
    const barredFingers = Array.from(fingerCounts.entries())
      .filter(([_, count]) => count > 1);
    
    if (barredFingers.length === 0) return false;

    // Check if the multiple uses of a finger are at this fret
    return this.selectedVariation.positions.some((pos, idx) => {
      const finger = this.selectedVariation?.fingerings[0][idx];
      return pos !== 'x' && parseInt(pos) === fret && 
        barredFingers.some(([f]) => f === finger);
    });
  }
}
