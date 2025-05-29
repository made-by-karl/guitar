import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MidiService } from './midi.service';
import { ChordAnalysisService } from './chord-analysis.service';

export interface ChordVariation {
  positions: string[];  // 'x' for muted or fret number
  fingerings: string[][]; // finger numbers, repeated numbers indicate barré
}

export interface Chord {
  id: string;
  name: string;
  category: string;
  variations: ChordVariation[];
  analysis?: {
    root: string;
    modifiers: string[];
    bass?: string;
  };
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
    private midiService: MidiService,
    private chordAnalysisService: ChordAnalysisService
  ) {
    this.loadChords();
  }

  private loadChords(): void {
    this.http.get<ChordData>('assets/data/chords.json')
      .pipe(
        map(data => {
          return Object.entries(data)
            .filter(([name, variations]) => {
              return variations !== null && variations.length > 0 && variations.every(v => v !== null);
            })
            .map(([name, variations]) => {
              const analysis = this.chordAnalysisService.parseChord(name);
              return {
                id: name.toLowerCase().replace('#', 'sharp'),
                name: name,
                category: this.getCategoryFromName(name),
                variations: variations,
                analysis
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

  getChordsByRootNote(): Map<string, Chord[]> {
    const grouped = new Map<string, Chord[]>();
    for (const chord of this.chords) {
      if (chord.analysis?.root) {
        const root = chord.analysis.root;
        if (!grouped.has(root)) {
          grouped.set(root, []);
        }
        grouped.get(root)?.push(chord);
      }
    }
    // Sort each group by number of modifiers
    for (const [root, chords] of grouped) {
      grouped.set(root, chords.sort((a, b) => {
        const aModCount = a.analysis?.modifiers?.length || 0;
        const bModCount = b.analysis?.modifiers?.length || 0;
        return aModCount - bModCount;
      }));
    }
    return grouped;
  }

  getAvailableRootNotes(): string[] {
    const roots = new Set<string>();
    for (const chord of this.chords) {
      if (chord.analysis?.root) {
        roots.add(chord.analysis.root);
      }
    }
    return Array.from(roots).sort();
  }

  getAvailableModifiers(): string[] {
    const modifiers = new Set<string>();
    for (const chord of this.chords) {
      if (chord.analysis?.modifiers) {
        chord.analysis.modifiers.forEach(mod => modifiers.add(mod));
      }
    }
    return Array.from(modifiers).sort();
  }

  getAvailableBassNotes(): string[] {
    const bassNotes = new Set<string>();
    for (const chord of this.chords) {
      if (chord.analysis?.bass) {
        bassNotes.add(chord.analysis.bass);
      }
    }
    return Array.from(bassNotes).sort();
  }

  filterChords(filters: { root?: string; modifier?: string; bass?: string }): Chord[] {
    return this.chords.filter(chord => {
      if (filters.root && chord.analysis?.root !== filters.root) {
        return false;
      }
      if (filters.modifier && (!chord.analysis?.modifiers || !chord.analysis.modifiers.includes(filters.modifier))) {
        return false;
      }
      if (filters.bass && chord.analysis?.bass !== filters.bass) {
        return false;
      }
      return true;
    });
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
