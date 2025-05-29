import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChordService, Chord } from '../../services/chord.service';

@Component({
  selector: 'app-chord-library',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './chord-library.component.html',
  styleUrls: ['./chord-library.component.scss']
})
export class ChordLibraryComponent implements OnInit {
  protected readonly Array = Array;  // For template access
  groupedChords: Map<string, Chord[]> = new Map();
  availableModifiers: string[] = [];
  availableBassNotes: string[] = [];
  availableRootNotes: string[] = [];
  isLoaded: boolean = false;

  // Filter state
  filterRoot: string = '';
  filterModifier: string = '';
  filterBass: string = '';

  constructor(private chordService: ChordService) {}

  ngOnInit() {
    // Initial load
    this.loadChords();
    
    // Set up interval to check if data is loaded
    const loadCheckInterval = setInterval(() => {
      if (this.chordService.isDataLoaded()) {
        this.loadChords();
        this.isLoaded = true;
        clearInterval(loadCheckInterval);
      }
    }, 100);
  }

  loadChords() {
    this.groupedChords = this.chordService.getChordsByRootNote();
    this.availableRootNotes = this.chordService.getAvailableRootNotes();
    this.availableModifiers = this.chordService.getAvailableModifiers();
    this.availableBassNotes = this.chordService.getAvailableBassNotes();
    this.applyFilters();
  }

  applyFilters() {
    const filteredChords = this.chordService.filterChords({
      root: this.filterRoot || undefined,
      modifier: this.filterModifier || undefined,
      bass: this.filterBass || undefined
    });

    // Group filtered chords by root note
    this.groupedChords = new Map();
    for (const chord of filteredChords) {
      if (!chord.analysis?.root) continue;
      if (!this.groupedChords.has(chord.analysis.root)) {
        this.groupedChords.set(chord.analysis.root, []);
      }
      this.groupedChords.get(chord.analysis.root)?.push(chord);
    }
  }

  selectChord(chord: Chord) {
    this.chordService.setSelectedChord(chord);
  }

  resetFilters() {
    this.filterRoot = '';
    this.filterModifier = '';
    this.filterBass = '';
    this.loadChords();
  }
}
