import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ChordService, Chord } from '../../services/chord.service';

@Component({
  selector: 'app-chord-viewer',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './chord-viewer.component.html',
  styleUrls: ['./chord-viewer.component.scss']
})
export class ChordViewerComponent implements OnInit {
  chord: Chord | null = null;
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
    }
  }

  getFingerAtPosition(string: number, fret: number): number | null {
    const finger = this.chord?.fingers.find(
      f => f.string === string && f.fret === fret
    );
    return finger ? finger.finger : null;
  }

  isBarreFret(fret: number): boolean {
    return this.chord?.isBarred === true && this.chord?.barreFret === fret;
  }
}
