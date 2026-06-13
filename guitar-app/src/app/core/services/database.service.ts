import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { SongSheet } from '@/app/features/sheets/services/song-sheets.model';
import { PickingNote, PlayingAction, PlayingPattern, RelativeString } from '@/app/features/patterns/services/playing-patterns.model';

/**
 * Database service for managing IndexedDB storage using Dexie.js
 */
@Injectable({
  providedIn: 'root'
})
export class DatabaseService extends Dexie {
  songSheets!: Table<SongSheet, string>;
  playingPatterns!: Table<PlayingPattern, string>;

  constructor() {
    super('GuitarAppDatabase');
    
    // Define database schema
    this.version(2).stores({
      songSheets: 'id, created, updated',
      playingPatterns: 'id, category, isCustom'
    }).upgrade(async tx => {
      await tx.table('playingPatterns').clear();
    });

    this.version(3).stores({
      songSheets: 'id, created, updated',
      playingPatterns: 'id, category, isCustom'
    });

    this.version(4).stores({
      songSheets: 'id, created, updated',
      playingPatterns: 'id, category, isCustom'
    }).upgrade(async tx => {
      await tx.table('playingPatterns').toCollection().modify(pattern => {
        migratePlayingPatternPickNotes(pattern as PlayingPattern);
      });

      await tx.table('songSheets').toCollection().modify(sheet => {
        const patterns = (sheet as { patterns?: PlayingPattern[] }).patterns;
        if (!Array.isArray(patterns)) {
          return;
        }

        patterns.forEach(pattern => migratePlayingPatternPickNotes(pattern));
      });
    });
  }
}

export function migratePlayingPatternPickNotes(pattern: PlayingPattern): void {
  pattern.measures?.forEach(measure => {
    measure.actions?.forEach(action => {
      if (!action) {
        return;
      }

      if (action.technique === 'pick') {
        const oldMode = (action as PlayingAction & { pickMode?: 'explicit' | 'relative' }).pickMode;
        action.pick = (action.pick ?? []).map((note): PickingNote => {
          const rawNote = note as unknown as Record<string, unknown>;
          const inferredMode = rawNote['mode'] === 'relative' || rawNote['mode'] === 'explicit'
            ? rawNote['mode']
            : oldMode ?? (typeof rawNote['string'] === 'string' ? 'relative' : 'explicit');

          if (inferredMode === 'relative') {
            const anchor = rawNote['anchor'] === 'base-note' ? 'base-note' : 'grip-note';
            const string = normalizeRelativeString(rawNote['string']);

            if (anchor === 'base-note') {
              return {
                mode: 'relative' as const,
                string,
                anchor
              };
            }

            return {
              mode: 'relative' as const,
              string,
              anchor,
              fretOffset: typeof rawNote['fretOffset'] === 'number' ? rawNote['fretOffset'] : 0
            };
          }

          return {
            mode: 'explicit' as const,
            string: typeof rawNote['string'] === 'number' ? rawNote['string'] : 0,
            fret: typeof rawNote['fret'] === 'number' ? rawNote['fret'] : 0
          };
        });

        delete (action as PlayingAction & { pickMode?: 'explicit' | 'relative' }).pickMode;
      }

      normalizeActionRelativeStrings(action);
    });
  });
}

function normalizeActionRelativeStrings(action: PlayingAction): void {
  const strumStrings = action.strum?.strings;
  if (strumStrings && typeof strumStrings === 'object' && !Array.isArray(strumStrings)) {
    const range = strumStrings as unknown as Record<string, unknown>;
    range['from'] = normalizeRelativeString(range['from']);
    range['to'] = normalizeRelativeString(range['to']);
  }

  if (action.legato && typeof action.legato === 'object') {
    const legato = action.legato as unknown as Record<string, unknown>;
    if (typeof legato['string'] === 'string') {
      legato['string'] = normalizeRelativeString(legato['string']);
    }
  }
}

function normalizeRelativeString(value: unknown): RelativeString {
  if (value === 'middle') {
    return 'lower-middle';
  }

  return isRelativeString(value) ? value : 'bass';
}

function isRelativeString(value: unknown): value is RelativeString {
  return value === 'bass'
    || value === 'second-from-bass'
    || value === 'lower-middle'
    || value === 'upper-middle'
    || value === 'second-from-top'
    || value === 'top';
}
