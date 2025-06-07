import { Injectable } from '@angular/core';
import { RhythmPattern, RhythmStep } from './rhythm-patterns.model';

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
        timeSignature: '4/4',
        tempo: 80,
        steps: [
          { technique: 'strum', direction: 'D', strings: [6,5,4,3,2,1] },
          { technique: 'strum', direction: 'D', strings: [6,5,4,3,2,1] },
          { technique: 'strum', direction: 'D', strings: [6,5,4,3,2,1] },
          { technique: 'strum', direction: 'D', strings: [6,5,4,3,2,1] }
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
        steps: [
          { technique: 'strum', direction: 'D', strings: [6,5,4,3,2,1] },
          { technique: 'strum', direction: 'U', strings: [6,5,4,3,2,1] },
          { technique: 'strum', direction: 'D', strings: [6,5,4,3,2,1] },
          { technique: 'strum', direction: 'U', strings: [6,5,4,3,2,1] }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'default-3',
        name: 'Folk/Pop',
        description: 'Popular folk/pop pattern with string selection.',
        category: 'Folk/Pop',
        timeSignature: '4/4',
        tempo: 90,
        steps: [
          { technique: 'strum', direction: 'D', strings: [6,5,4,3,2,1] },
          { technique: 'strum', direction: 'D', strings: [6,5,4,3,2,1] },
          { technique: 'strum', direction: 'U', strings: [1,2,3] },
          { technique: 'strum', direction: 'U', strings: [1,2,3] },
          { technique: 'strum', direction: 'D', strings: [6,5,4,3,2,1] },
          { technique: 'strum', direction: 'U', strings: [1,2,3] }
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
        steps: [
          { technique: 'pick', direction: null, strings: [6] },
          { technique: 'strum', direction: 'D', strings: [4,3,2,1] },
          { technique: 'strum', direction: 'U', strings: [4,3,2,1] }
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
        steps: [
          { technique: 'pick', direction: null, strings: [6] },
          { technique: 'strum', direction: 'D', strings: [4,3,2,1] },
          { technique: 'pick', direction: null, strings: [5] },
          { technique: 'strum', direction: 'U', strings: [4,3,2,1] }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'default-6',
        name: 'Arpeggio',
        description: 'Simple arpeggio picking pattern.',
        category: 'Arpeggio',
        timeSignature: '4/4',
        tempo: 80,
        steps: [
          { technique: 'pick', direction: null, strings: [6] },
          { technique: 'pick', direction: null, strings: [4] },
          { technique: 'pick', direction: null, strings: [3] },
          { technique: 'pick', direction: null, strings: [2] }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'default-7',
        name: 'Travis Picking',
        description: 'Classic Travis picking: alternating bass and treble strings.',
        category: 'Fingerstyle',
        timeSignature: '4/4',
        tempo: 100,
        steps: [
          { technique: 'pick', direction: null, strings: [6] },
          { technique: 'pick', direction: null, strings: [3] },
          { technique: 'pick', direction: null, strings: [4] },
          { technique: 'pick', direction: null, strings: [2] },
          { technique: 'pick', direction: null, strings: [5] },
          { technique: 'pick', direction: null, strings: [3] },
          { technique: 'pick', direction: null, strings: [4] },
          { technique: 'pick', direction: null, strings: [2] }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'default-8',
        name: 'Simple Arpeggio (PIMA)',
        description: 'Classical PIMA arpeggio: thumb, index, middle, ring.',
        category: 'Classical',
        timeSignature: '4/4',
        tempo: 90,
        steps: [
          { technique: 'pick', direction: null, strings: [6] }, // P
          { technique: 'pick', direction: null, strings: [3] }, // I
          { technique: 'pick', direction: null, strings: [2] }, // M
          { technique: 'pick', direction: null, strings: [1] }  // A
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'default-9',
        name: 'Alternating Bass',
        description: 'Alternating bass with treble fill, common in folk and country.',
        category: 'Fingerstyle',
        timeSignature: '4/4',
        tempo: 110,
        steps: [
          { technique: 'pick', direction: null, strings: [6] },
          { technique: 'pick', direction: null, strings: [2] },
          { technique: 'pick', direction: null, strings: [4] },
          { technique: 'pick', direction: null, strings: [3] }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'default-10',
        name: '6/8 Ballad Picking',
        description: 'Arpeggiated picking in 6/8 time, common in ballads.',
        category: 'Ballad',
        timeSignature: '6/8',
        tempo: 70,
        steps: [
          { technique: 'pick', direction: null, strings: [5] },
          { technique: 'pick', direction: null, strings: [3] },
          { technique: 'pick', direction: null, strings: [2] },
          { technique: 'pick', direction: null, strings: [4] },
          { technique: 'pick', direction: null, strings: [3] },
          { technique: 'pick', direction: null, strings: [2] }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'default-11',
        name: 'Fingerstyle Waltz',
        description: 'Waltz (3/4) fingerstyle: bass, mid, high.',
        category: 'Waltz',
        timeSignature: '3/4',
        tempo: 90,
        steps: [
          { technique: 'pick', direction: null, strings: [5] },
          { technique: 'pick', direction: null, strings: [3] },
          { technique: 'pick', direction: null, strings: [2] }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
    ];
    this.patterns = defaults;
    this.save();
  }
}
