import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ChordFinger {
  fret: number;
  string: number;
  finger: number;
}

export interface Chord {
  id: string;
  name: string;
  fingers: ChordFinger[];
  isBarred: boolean;
  barreFret?: number;
  category: string;
}

interface ChordData {
  chords: Chord[];
}

@Injectable({
  providedIn: 'root'
})
export class ChordService {
  private chords: Chord[] = [];
  private selectedChordSubject = new BehaviorSubject<Chord | null>(null);
  private chordsLoaded = false;

  constructor(private http: HttpClient) {
    this.loadChords();
  }

  private loadChords(): void {
    this.http.get<ChordData>('assets/data/chords.json')
      .pipe(
        map(data => data.chords)
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
}
