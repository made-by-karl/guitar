import { Injectable } from '@angular/core';
import { RhythmPattern, RhythmStep } from './rhythm-patterns.model';
import { note } from 'app/common/semitones';

const STORAGE_KEY = 'rhythmPatterns';

@Injectable({ providedIn: 'root' })
export class RhythmPatternsService {
  readonly defaultTuning = [
          note('E', 2),
          note('A', 2),
          note('D', 3),
          note('G', 3),
          note('B', 3),
          note('E', 4)];
          
  private patterns: RhythmPattern[] = [];

  constructor() {
    this.load();
    if (this.patterns.length === 0) {
      this.addDefaultPatterns();
    }
  }

  private load() {
    const data = localStorage.getItem(STORAGE_KEY);
    this.patterns = data ? JSON.parse(data) : [];
  }

  private save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.patterns));
  }

  getAll(): RhythmPattern[] {
    return [...this.patterns];
  }

  getById(id: string): RhythmPattern | undefined {
    return this.patterns.find(p => p.id === id);
  }

  add(pattern: RhythmPattern) {
    this.patterns.push(pattern);
    this.save();
  }

  update(pattern: RhythmPattern) {
    const idx = this.patterns.findIndex(p => p.id === pattern.id);
    if (idx !== -1) {
      this.patterns[idx] = pattern;
      this.save();
    }
  }

  delete(id: string) {
    this.patterns = this.patterns.filter(p => p.id !== id);
    this.save();
  }

  private addDefaultPatterns() {
    const defaults: RhythmPattern[] = [
      {
        id: 'default-1',
        name: 'Downstrokes Only',
        description: 'Simple downstrokes on all strings.',
        category: 'Basic',
        timeSignature: '4/4',
        tempo: 80,
        tuning: this.defaultTuning,
        steps: [
          { technique: 'strum', direction: 'D', beat: 1, timing: 'on-beat', strum: { strings: 'all' } },
          { technique: 'strum', direction: 'D', beat: 2, timing: 'on-beat', strum: { strings: 'all' } },
          { technique: 'strum', direction: 'D', beat: 3, timing: 'on-beat', strum: { strings: 'all' } },
          { technique: 'strum', direction: 'D', beat: 4, timing: 'on-beat', strum: { strings: 'all' } }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'default-2',
        name: 'Down-Up Alternating',
        description: 'Alternating down and up strokes on all strings.',
        category: 'Basic',
        timeSignature: '4/4',
        tempo: 100,
        tuning: this.defaultTuning,
        steps: [
          { technique: 'strum', direction: 'D', beat: 1, timing: 'on-beat', strum: { strings: 'all' } },
          { technique: 'strum', direction: 'U', beat: 1, timing: 'half-past', strum: { strings: 'all' } },
          { technique: 'strum', direction: 'D', beat: 2, timing: 'on-beat', strum: { strings: 'all' } },
          { technique: 'strum', direction: 'U', beat: 2, timing: 'half-past', strum: { strings: 'all' } },
          { technique: 'strum', direction: 'D', beat: 3, timing: 'on-beat', strum: { strings: 'all' } },
          { technique: 'strum', direction: 'U', beat: 3, timing: 'half-past', strum: { strings: 'all' } },
          { technique: 'strum', direction: 'D', beat: 4, timing: 'on-beat', strum: { strings: 'all' } },
          { technique: 'strum', direction: 'U', beat: 4, timing: 'half-past', strum: { strings: 'all' } }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'default-3',
        name: 'Folk/Pop',
        description: 'Classic folk/pop pattern: Down-Down-Up-Down-Up with precise timing.',
        category: 'Folk/Pop',
        timeSignature: '4/4',
        tempo: 90,
        tuning: this.defaultTuning,
        steps: [
          { technique: 'strum', direction: 'D', beat: 1, timing: 'on-beat', strum: { strings: 'all' } },
          { technique: 'strum', direction: 'D', beat: 2, timing: 'on-beat', strum: { strings: 'all' } },
          { technique: 'strum', direction: 'U', beat: 2, timing: 'half-past', strum: { strings: 'treble' } },
          { technique: 'strum', direction: 'D', beat: 3, timing: 'on-beat', strum: { strings: 'all' } },
          { technique: 'strum', direction: 'U', beat: 3, timing: 'half-past', strum: { strings: 'treble' } }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'default-4',
        name: 'Waltz',
        description: 'Waltz in 3/4 time, picking bass then strumming high strings.',
        category: 'Waltz',
        timeSignature: '3/4',
        tempo: 80,
        tuning: this.defaultTuning,
        steps: [
          { technique: 'pick', direction: null, beat: 1, timing: 'on-beat', pick: [{ string: 0, fret: 0 }] },
          { technique: 'strum', direction: 'D', beat: 2, timing: 'on-beat', strum: { strings: 'treble' } },
          { technique: 'strum', direction: 'U', beat: 3, timing: 'on-beat', strum: { strings: 'treble' } }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'default-5',
        name: 'Hybrid: Pick Bass, Strum Rest',
        description: 'Pick the bass string, then strum the rest.',
        category: 'Hybrid',
        timeSignature: '4/4',
        tempo: 90,
        tuning: this.defaultTuning,
        steps: [
          { technique: 'pick', direction: null, beat: 1, timing: 'on-beat', pick: [{ string: 0, fret: 0 }] },
          { technique: 'strum', direction: 'D', beat: 1, timing: 'half-past', strum: { strings: 'treble' } },
          { technique: 'pick', direction: null, beat: 2, timing: 'on-beat', pick: [{ string: 1, fret: 0 }] },
          { technique: 'strum', direction: 'U', beat: 2, timing: 'half-past', strum: { strings: 'treble' } },
          { technique: 'pick', direction: null, beat: 3, timing: 'on-beat', pick: [{ string: 0, fret: 0 }] },
          { technique: 'strum', direction: 'D', beat: 3, timing: 'half-past', strum: { strings: 'treble' } },
          { technique: 'pick', direction: null, beat: 4, timing: 'on-beat', pick: [{ string: 1, fret: 0 }] },
          { technique: 'strum', direction: 'U', beat: 4, timing: 'half-past', strum: { strings: 'treble' } }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'default-6',
        name: 'Folk Strum (D-D-U-U-D-U)',
        description: 'Classic folk/country pattern with extra upstrokes.',
        category: 'Folk/Country',
        timeSignature: '4/4',
        tempo: 85,
        tuning: this.defaultTuning,
        steps: [
          { technique: 'strum', direction: 'D', beat: 1, timing: 'on-beat', strum: { strings: 'all' } },
          { technique: 'strum', direction: 'D', beat: 2, timing: 'on-beat', strum: { strings: 'all' } },
          { technique: 'strum', direction: 'U', beat: 2, timing: 'half-past', strum: { strings: 'treble' } },
          { technique: 'strum', direction: 'U', beat: 3, timing: 'on-beat', strum: { strings: 'treble' } },
          { technique: 'strum', direction: 'D', beat: 3, timing: 'half-past', strum: { strings: 'all' } },
          { technique: 'strum', direction: 'U', beat: 4, timing: 'on-beat', strum: { strings: 'treble' } }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'default-7',
        name: 'Reggae Upstrokes',
        description: 'Classic reggae offbeat upstrokes on 2 and 4.',
        category: 'Reggae',
        timeSignature: '4/4',
        tempo: 75,
        tuning: this.defaultTuning,
        steps: [
          { technique: 'rest', direction: null, beat: 1, timing: 'on-beat' },
          { technique: 'strum', direction: 'U', beat: 1, timing: 'half-past', strum: { strings: 'treble' } },
          { technique: 'rest', direction: null, beat: 2, timing: 'on-beat' },
          { technique: 'strum', direction: 'U', beat: 2, timing: 'half-past', strum: { strings: 'treble' } },
          { technique: 'rest', direction: null, beat: 3, timing: 'on-beat' },
          { technique: 'strum', direction: 'U', beat: 3, timing: 'half-past', strum: { strings: 'treble' } },
          { technique: 'rest', direction: null, beat: 4, timing: 'on-beat' },
          { technique: 'strum', direction: 'U', beat: 4, timing: 'half-past', strum: { strings: 'treble' } }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'default-8',
        name: 'Rock Power Chords',
        description: 'Aggressive downstrokes on power chord strings.',
        category: 'Rock',
        timeSignature: '4/4',
        tempo: 120,
        tuning: this.defaultTuning,
        steps: [
          { technique: 'strum', direction: 'D', beat: 1, timing: 'on-beat', strum: { strings: 'power' }, modifiers: ['palm-mute'] },
          { technique: 'strum', direction: 'D', beat: 1, timing: 'half-past', strum: { strings: 'power' }, modifiers: ['palm-mute'] },
          { technique: 'strum', direction: 'D', beat: 2, timing: 'on-beat', strum: { strings: 'power' }, modifiers: ['palm-mute'] },
          { technique: 'strum', direction: 'D', beat: 3, timing: 'on-beat', strum: { strings: 'power' }, modifiers: ['palm-mute', 'accent'] },
          { technique: 'strum', direction: 'D', beat: 3, timing: 'half-past', strum: { strings: 'power' }, modifiers: ['palm-mute'] },
          { technique: 'strum', direction: 'D', beat: 4, timing: 'on-beat', strum: { strings: 'power' }, modifiers: ['palm-mute'] }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'default-9',
        name: 'Ballad Fingerpicking',
        description: 'Gentle fingerpicking pattern for ballads.',
        category: 'Fingerpicking',
        timeSignature: '4/4',
        tempo: 65,
        tuning: this.defaultTuning,
        steps: [
          { technique: 'pick', direction: null, beat: 1, timing: 'on-beat', pick: [{ string: 0, fret: 0 }] },
          { technique: 'pick', direction: null, beat: 1, timing: 'quarter-past', pick: [{ string: 2, fret: 0 }] },
          { technique: 'pick', direction: null, beat: 1, timing: 'half-past', pick: [{ string: 4, fret: 0 }] },
          { technique: 'pick', direction: null, beat: 1, timing: 'three-quarter-past', pick: [{ string: 2, fret: 0 }] },
          { technique: 'pick', direction: null, beat: 2, timing: 'on-beat', pick: [{ string: 1, fret: 0 }] },
          { technique: 'pick', direction: null, beat: 2, timing: 'quarter-past', pick: [{ string: 3, fret: 0 }] },
          { technique: 'pick', direction: null, beat: 2, timing: 'half-past', pick: [{ string: 5, fret: 0 }] },
          { technique: 'pick', direction: null, beat: 2, timing: 'three-quarter-past', pick: [{ string: 3, fret: 0 }] }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'default-10',
        name: 'Travis Picking',
        description: 'Alternating bass with melody picks.',
        category: 'Fingerpicking',
        timeSignature: '4/4',
        tempo: 70,
        tuning: this.defaultTuning,
        steps: [
          { technique: 'pick', direction: null, beat: 1, timing: 'on-beat', pick: [{ string: 0, fret: 0 }] },
          { technique: 'pick', direction: null, beat: 1, timing: 'half-past', pick: [{ string: 4, fret: 0 }] },
          { technique: 'pick', direction: null, beat: 2, timing: 'on-beat', pick: [{ string: 1, fret: 0 }] },
          { technique: 'pick', direction: null, beat: 2, timing: 'half-past', pick: [{ string: 5, fret: 0 }] },
          { technique: 'pick', direction: null, beat: 3, timing: 'on-beat', pick: [{ string: 0, fret: 0 }] },
          { technique: 'pick', direction: null, beat: 3, timing: 'half-past', pick: [{ string: 3, fret: 0 }] },
          { technique: 'pick', direction: null, beat: 4, timing: 'on-beat', pick: [{ string: 1, fret: 0 }] },
          { technique: 'pick', direction: null, beat: 4, timing: 'half-past', pick: [{ string: 4, fret: 0 }] }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'default-11',
        name: 'Funk Muted Strums',
        description: 'Percussive funk pattern with muted strings.',
        category: 'Funk',
        timeSignature: '4/4',
        tempo: 100,
        tuning: this.defaultTuning,
        steps: [
          { technique: 'strum', direction: 'D', beat: 1, timing: 'on-beat', strum: { strings: 'all' } },
          { technique: 'strum', direction: 'D', beat: 1, timing: 'quarter-past', strum: { strings: 'all' }, modifiers: ['mute'] },
          { technique: 'percussive', direction: null, beat: 1, timing: 'half-past' },
          { technique: 'strum', direction: 'U', beat: 1, timing: 'three-quarter-past', strum: { strings: 'treble' } },
          { technique: 'percussive', direction: null, beat: 2, timing: 'on-beat' },
          { technique: 'strum', direction: 'U', beat: 2, timing: 'half-past', strum: { strings: 'treble' } },
          { technique: 'strum', direction: 'D', beat: 3, timing: 'on-beat', strum: { strings: 'all' }, modifiers: ['accent'] },
          { technique: 'percussive', direction: null, beat: 4, timing: 'on-beat' }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'default-12',
        name: 'Bossa Nova',
        description: 'Smooth bossa nova rhythm with syncopation.',
        category: 'Bossa Nova',
        timeSignature: '4/4',
        tempo: 85,
        tuning: this.defaultTuning,
        steps: [
          { technique: 'strum', direction: 'D', beat: 1, timing: 'on-beat', strum: { strings: 'all' } },
          { technique: 'strum', direction: 'U', beat: 1, timing: 'three-quarter-past', strum: { strings: 'treble' } },
          { technique: 'strum', direction: 'D', beat: 2, timing: 'quarter-past', strum: { strings: 'bass' } },
          { technique: 'strum', direction: 'U', beat: 2, timing: 'half-past', strum: { strings: 'treble' } },
          { technique: 'strum', direction: 'D', beat: 3, timing: 'on-beat', strum: { strings: 'all' } },
          { technique: 'strum', direction: 'U', beat: 4, timing: 'on-beat', strum: { strings: 'treble' } }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
    ];
    this.patterns = defaults;
    this.save();
  }
}
