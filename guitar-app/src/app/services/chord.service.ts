import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MidiService } from './midi.service';

export interface ChordVariation {
  positions: string[];  // 'x' for muted or fret number
  fingerings: string[][]; // finger numbers, repeated numbers indicate barré
}

export interface Chord {
  id: string;
  name: string;
  category: string;
  variations: ChordVariation[];
}

interface ChordData {
  [key: string]: ChordVariation[];  // The key is the chord name (e.g., "C#")
}

@Injectable({
  providedIn: 'root'
})
export class ChordService {
  private chords: Chord[] = [];
  private selectedChordSubject = new BehaviorSubject<Chord | null>(null);
  private chordsLoaded = false;

  constructor(
    private http: HttpClient,
    private midiService: MidiService
  ) {
    this.loadChords();
  }

  private loadChords(): void {
    this.http.get<ChordData>('assets/data/chords.json')
      .pipe(
        map(data => {
          // Transform the data from {chordName: variations[]} to Chord[]
          return Object.entries(data)
            .filter(([name, variations]) => {
            // Filter out variations that are empty or contain null values
            return variations !== null && variations.length > 0 && variations.every(v => v !== null);
          })
            .map(([name, variations]) => {
            // Transform the variations to the desired format
            return {
              id: name.toLowerCase().replace('#', 'sharp'),  // e.g., "C#" -> "csharp"
              name: name,
              category: this.getCategoryFromName(name),  // e.g., "major", "minor", etc.
              variations: variations
            };
          });
        })
      )
      .subscribe({
        next: (chords) => {
          this.chords = chords;
          this.chordsLoaded = true;
        },
        error: (error) => {
          console.error('Error loading chords:', error);
          this.chordsLoaded = true;
        }
      });
  }

  private getCategoryFromName(name: string): string {
    if (name.includes('dim')) return 'diminished';
    if (name.includes('aug')) return 'augmented';
    if (name.includes('sus')) return 'suspended';
    if (name.includes('7')) return '7th';
    if (name.includes('m')) return 'minor';
    return 'major';
  }

  getChords(): Chord[] {
    return this.chords;
  }

  getChordsByCategory(category: string): Chord[] {
    return this.chords.filter(chord => chord.category === category);
  }

  getChordById(id: string): Chord | undefined {
    return this.chords.find(chord => chord.id === id);
  }

  setSelectedChord(chord: Chord | null) {
    this.selectedChordSubject.next(chord);
  }

  getSelectedChord(): Observable<Chord | null> {
    return this.selectedChordSubject.asObservable();
  }

  isDataLoaded(): boolean {
    return this.chordsLoaded;
  }

  async playChord(chordId: string) {
    const chord = this.getChordById(chordId);
    if (!chord || chord.variations.length === 0) return;

    // Get the first variation of the chord and play it using MIDI
    const variation = chord.variations[0];
    await this.midiService.generateAndPlayChord(variation.positions);
  }
}
