import { Injectable } from '@angular/core';
import { PlayingPattern, PlayingAction } from '@/app/features/patterns/services/playing-patterns.model';
import { DatabaseService } from '@/app/core/services/database.service';

@Injectable({ providedIn: 'root' })
export class PlayingPatternsService {

  constructor(private db: DatabaseService) {
    this.initialize();
  }

  private async initialize() {
    try {
      const count = await this.db.playingPatterns.count();
      if (count === 0) {
        await this.addDefaultPatterns();
      }
    } catch (error) {
      console.error('Error initializing patterns:', error);
    }
  }

  async getAll(): Promise<PlayingPattern[]> {
    try {
      return (await this.db.playingPatterns.toArray()).map(pattern => this.clonePattern(pattern));
    } catch (error) {
      console.error('Error loading patterns:', error);
      return [];
    }
  }

  async getById(id: string): Promise<PlayingPattern | undefined> {
    try {
      const pattern = await this.db.playingPatterns.get(id);
      return pattern ? this.clonePattern(pattern) : undefined;
    } catch (error) {
      console.error('Error loading pattern:', error);
      return undefined;
    }
  }

  async add(pattern: PlayingPattern): Promise<void> {
    try {
      await this.db.playingPatterns.add(this.clonePattern(pattern));
    } catch (error) {
      console.error('Error adding pattern:', error);
      throw error;
    }
  }

  async update(pattern: PlayingPattern): Promise<void> {
    try {
      await this.db.playingPatterns.put(this.clonePattern(pattern));
    } catch (error) {
      console.error('Error updating pattern:', error);
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.db.playingPatterns.delete(id);
    } catch (error) {
      console.error('Error deleting pattern:', error);
      throw error;
    }
  }

  private async addDefaultPatterns() {
    const defaults: PlayingPattern[] = [
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
    try {
      await this.db.playingPatterns.bulkAdd(defaults);
    } catch (error) {
      console.error('Error adding default patterns:', error);
    }
  }

  private clonePattern(pattern: PlayingPattern): PlayingPattern {
    return {
      ...pattern,
      beatGrips: (pattern.beatGrips ?? []).map(grip => ({ ...grip })),
      actionGripOverrides: (pattern.actionGripOverrides ?? []).map(grip => ({ ...grip })),
      measures: pattern.measures.map(measure => ({
        ...measure,
        actions: measure.actions.map(action => action ? {
          ...action,
          modifiers: action.modifiers ? [...action.modifiers] : undefined,
          strum: action.strum ? { ...action.strum } : undefined,
          pick: action.pick ? action.pick.map(note => ({ ...note })) : undefined,
          percussive: action.percussive ? { ...action.percussive } : undefined
        } : null)
      }))
    };
  }
}

function fromQuarters(actions: (PlayingAction | null)[]): (PlayingAction | null)[] {
  // Convert a pattern defined in quarter notes to 16-action array
  const sixteenthActions: (PlayingAction | null)[] = Array(16).fill(null);
  
  // Place actions on quarter note positions (0, 4, 8, 12)
  for (let i = 0; i < actions.length && i < 4; i++) {
    sixteenthActions[i * 4] = actions[i];
  }
  
  return sixteenthActions;
}

function fromEigths(actions: (PlayingAction | null)[]): (PlayingAction | null)[] {
  // Convert a pattern defined in eighth notes to 16-action array
  const sixteenthActions: (PlayingAction | null)[] = Array(16).fill(null);
  
  // Place actions on eighth note positions (0, 2, 4, 6, 8, 10, 12, 14)
  for (let i = 0; i < actions.length && i < 8; i++) {
    sixteenthActions[i * 2] = actions[i];
  }
  
  return sixteenthActions;
}
