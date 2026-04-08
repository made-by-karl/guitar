import { Injectable } from '@angular/core';
import { PlayingPattern } from '@/app/features/patterns/services/playing-patterns.model';
import { DatabaseService } from '@/app/core/services/database.service';
import { createDefaultPlayingPatterns } from '@/app/features/patterns/services/playing-pattern-defaults';

@Injectable({ providedIn: 'root' })
export class PlayingPatternsService {
  private readonly initializer: Promise<void>;

  constructor(private db: DatabaseService) {
    this.initializer = this.initialize();
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
    await this.initializer;
  
    try {
      return (await this.db.playingPatterns.toArray()).map(pattern => this.clonePattern(pattern));
    } catch (error) {
      console.error('Error loading patterns:', error);
      return [];
    }
  }

  async getById(id: string): Promise<PlayingPattern | undefined> {
    await this.initializer;
  
    try {
      const pattern = await this.db.playingPatterns.get(id);
      return pattern ? this.clonePattern(pattern) : undefined;
    } catch (error) {
      console.error('Error loading pattern:', error);
      return undefined;
    }
  }

  async add(pattern: PlayingPattern): Promise<void> {
    await this.initializer;
  
    try {
      await this.db.playingPatterns.add(this.clonePattern(pattern));
    } catch (error) {
      console.error('Error adding pattern:', error);
      throw error;
    }
  }

  async update(pattern: PlayingPattern): Promise<void> {
    await this.initializer;
  
    try {
      await this.db.playingPatterns.put(this.clonePattern(pattern));
    } catch (error) {
      console.error('Error updating pattern:', error);
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    await this.initializer;
  
    try {
      await this.db.playingPatterns.delete(id);
    } catch (error) {
      console.error('Error deleting pattern:', error);
      throw error;
    }
  }

  private async addDefaultPatterns() {
    const defaults: PlayingPattern[] = createDefaultPlayingPatterns();
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
          legato: action.legato ? { ...action.legato } : undefined,
          percussive: action.percussive ? { ...action.percussive } : undefined
        } : null)
      }))
    };
  }
}
