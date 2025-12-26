import { Injectable } from '@angular/core';
import { RhythmPattern, RhythmAction } from './rhythm-patterns.model';

const STORAGE_KEY = 'rhythmPatterns';

@Injectable({ providedIn: 'root' })
export class RhythmPatternsService {
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
        measures: [{
          timeSignature: '4/4',
          actions: fromQuarters([
            { technique: 'strum', strum: { direction: 'D', strings: 'all' } },
            { technique: 'strum', strum: { direction: 'D', strings: 'all' } },
            { technique: 'strum', strum: { direction: 'D', strings: 'all' } },
            { technique: 'strum', strum: { direction: 'D', strings: 'all' } }
          ])
        }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'default-2',
        name: 'Down-Up Alternating',
        description: 'Alternating down and up strokes on all strings.',
        category: 'Basic',
        measures: [{
          timeSignature: '4/4',
          actions: fromEigths([
            { technique: 'strum', strum: { direction: 'D', strings: 'all' } },
            { technique: 'strum', strum: { direction: 'U', strings: 'treble' } },
            { technique: 'strum', strum: { direction: 'D', strings: 'all' } },
            { technique: 'strum', strum: { direction: 'U', strings: 'treble' } },
            { technique: 'strum', strum: { direction: 'D', strings: 'all' } },
            { technique: 'strum', strum: { direction: 'U', strings: 'treble' } },
            { technique: 'strum', strum: { direction: 'D', strings: 'all' } },
            { technique: 'strum', strum: { direction: 'U', strings: 'treble' } }
          ])
        }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'default-3',
        name: 'Folk/Pop',
        description: 'Classic folk/pop pattern: Down-Down-Up-Down-Up with precise timing.',
        category: 'Folk/Pop',
        measures: [{
          timeSignature: '4/4',
          actions: fromEigths([
            { technique: 'strum', strum: { direction: 'D', strings: 'all' } },
            null,
            { technique: 'strum', strum: { direction: 'D', strings: 'all' } },
            { technique: 'strum', strum: { direction: 'U', strings: 'treble' } },
            { technique: 'strum', strum: { direction: 'D', strings: 'all' } },
            { technique: 'strum', strum: { direction: 'U', strings: 'treble' } }
          ])
        }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'default-4',
        name: 'Waltz',
        description: 'Waltz in 3/4 time, picking bass then strumming high strings.',
        category: 'Waltz',
        measures: [{
          timeSignature: '3/4',
          actions: fromEigths([
            { technique: 'pick', pick: [{ string: 0, fret: 0 }] },
            null,
            { technique: 'strum', strum: { direction: 'D', strings: 'treble' } },
            null,
            { technique: 'strum', strum: { direction: 'U', strings: 'treble' } }
          ])
        }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'default-5',
        name: 'Hybrid: Pick Bass, Strum Rest',
        description: 'Pick the bass string, then strum the rest.',
        category: 'Hybrid',
        measures: [{
          timeSignature: '4/4',
          actions: fromEigths([
            { technique: 'pick', pick: [{ string: 0, fret: 0 }] },
            { technique: 'strum', strum: { direction: 'D', strings: 'treble' } },
            { technique: 'pick', pick: [{ string: 1, fret: 0 }] },
            { technique: 'strum', strum: { direction: 'U', strings: 'treble' } },
            { technique: 'pick', pick: [{ string: 0, fret: 0 }] },
            { technique: 'strum', strum: { direction: 'D', strings: 'treble' } },
            { technique: 'pick', pick: [{ string: 1, fret: 0 }] },
            { technique: 'strum', strum: { direction: 'U', strings: 'treble' } }
          ])
        }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'default-6',
        name: 'Folk Strum (D-D-U-U-D-U)',
        description: 'Classic folk/country pattern with extra upstrokes.',
        category: 'Folk/Country',
        measures: [{
          timeSignature: '4/4',
          actions: fromEigths([
            { technique: 'strum', strum: { direction: 'D', strings: 'all' } },
            null,
            { technique: 'strum', strum: { direction: 'D', strings: 'all' } },
            { technique: 'strum', strum: { direction: 'U', strings: 'treble' } },
            { technique: 'strum', strum: { direction: 'U', strings: 'treble' } },
            { technique: 'strum', strum: { direction: 'D', strings: 'all' } },
            { technique: 'strum', strum: { direction: 'U', strings: 'treble' } }
          ])
        }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'default-7',
        name: 'Rock Power Chords',
        description: 'Aggressive downstrokes on power chord strings.',
        category: 'Rock',
        measures: [{
          timeSignature: '4/4',
          actions: fromEigths([
            { technique: 'strum', strum: { direction: 'D', strings: 'power' }, modifiers: ['palm-mute'] },
            { technique: 'strum', strum: { direction: 'D', strings: 'power' }, modifiers: ['palm-mute'] },
            { technique: 'strum', strum: { direction: 'D', strings: 'power' }, modifiers: ['palm-mute'] },
            null,
            { technique: 'strum', strum: { direction: 'D', strings: 'power' }, modifiers: ['palm-mute', 'accent'] },
            { technique: 'strum', strum: { direction: 'D', strings: 'power' }, modifiers: ['palm-mute'] },
            { technique: 'strum', strum: { direction: 'D', strings: 'power' }, modifiers: ['palm-mute'] }
          ])
        }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'default-8',
        name: 'Ballad Fingerpicking',
        description: 'Gentle fingerpicking pattern for ballads.',
        category: 'Fingerpicking',
        measures: [{
          timeSignature: '4/4',
          actions: fromEigths([
            { technique: 'pick', pick: [{ string: 0, fret: 0 }] },
            { technique: 'pick', pick: [{ string: 2, fret: 0 }] },
            { technique: 'pick', pick: [{ string: 4, fret: 0 }] },
            { technique: 'pick', pick: [{ string: 2, fret: 0 }] },
            { technique: 'pick', pick: [{ string: 1, fret: 0 }] },
            { technique: 'pick', pick: [{ string: 3, fret: 0 }] },
            { technique: 'pick', pick: [{ string: 5, fret: 0 }] },
            { technique: 'pick', pick: [{ string: 3, fret: 0 }] }
          ])
        }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'default-9',
        name: 'Travis Picking',
        description: 'Alternating bass with melody picks.',
        category: 'Fingerpicking',
        measures: [{
          timeSignature: '4/4',
          actions: fromEigths([
            { technique: 'pick', pick: [{ string: 0, fret: 0 }] },
            { technique: 'pick', pick: [{ string: 4, fret: 0 }] },
            { technique: 'pick', pick: [{ string: 1, fret: 0 }] },
            { technique: 'pick', pick: [{ string: 5, fret: 0 }] },
            { technique: 'pick', pick: [{ string: 0, fret: 0 }] },
            { technique: 'pick', pick: [{ string: 3, fret: 0 }] },
            { technique: 'pick', pick: [{ string: 1, fret: 0 }] },
            { technique: 'pick', pick: [{ string: 4, fret: 0 }] }
          ])
        }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'default-10',
        name: 'Bossa Nova',
        description: 'Smooth bossa nova rhythm with syncopation.',
        category: 'Bossa Nova',
        measures: [{
          timeSignature: '4/4',
          actions: [
            { technique: 'strum', strum: { direction: 'D', strings: 'all' } },
            null,
            null,
            { technique: 'strum', strum: { direction: 'U', strings: 'treble' } },
            null,
            { technique: 'strum', strum: { direction: 'D', strings: 'bass' } },
            { technique: 'strum', strum: { direction: 'U', strings: 'treble' } },
            null,
            { technique: 'strum', strum: { direction: 'D', strings: 'all' } },
            null,
            null,
            null,
            { technique: 'strum', strum: { direction: 'U', strings: 'treble' } },
            null,
            null,
            null
          ]
        }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
    ];
    this.patterns = defaults;
    this.save();
  }
}

function fromQuarters(actions: (RhythmAction | null)[]): (RhythmAction | null)[] {
  // Convert a pattern defined in quarter notes to 16-action array
  const sixteenthActions: (RhythmAction | null)[] = Array(16).fill(null);
  
  // Place actions on quarter note positions (0, 4, 8, 12)
  for (let i = 0; i < actions.length && i < 4; i++) {
    sixteenthActions[i * 4] = actions[i];
  }
  
  return sixteenthActions;
}

function fromEigths(actions: (RhythmAction | null)[]): (RhythmAction | null)[] {
  // Convert a pattern defined in eighth notes to 16-action array
  const sixteenthActions: (RhythmAction | null)[] = Array(16).fill(null);
  
  // Place actions on eighth note positions (0, 2, 4, 6, 8, 10, 12, 14)
  for (let i = 0; i < actions.length && i < 8; i++) {
    sixteenthActions[i * 2] = actions[i];
  }
  
  return sixteenthActions;
}
