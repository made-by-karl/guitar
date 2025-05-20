import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ChordService, Chord } from '../../services/chord.service';

@Component({
  selector: 'app-chord-library',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './chord-library.component.html',
  styleUrls: ['./chord-library.component.scss']
})
export class ChordLibraryComponent implements OnInit {
  chords: Chord[] = [];
  filteredChords: Chord[] = [];
  selectedCategory: string = 'major';
  isLoaded: boolean = false;

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
    this.chords = this.chordService.getChords();
    this.filterByCategory(this.selectedCategory);
  }

  filterByCategory(category: string) {
    this.selectedCategory = category;
    this.filteredChords = this.chordService.getChordsByCategory(category);
  }

  selectChord(chord: Chord) {
    this.chordService.setSelectedChord(chord);
  }
}
