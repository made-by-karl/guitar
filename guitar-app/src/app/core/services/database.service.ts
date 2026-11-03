import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { migrateSongArrangement } from '@/app/features/sheets/services/song-arrangement';
import { SongPartActionGrip, SongPartMeasure, SongSheet } from '@/app/features/sheets/services/song-sheets.model';
import { Measure, PickingNote, PlayingAction, PlayingPattern, RelativeString } from '@/app/features/patterns/services/playing-patterns.model';
import { createDefaultPlayingPatterns } from '@/app/features/patterns/services/playing-pattern-defaults';
import type { PracticeData } from '@/app/core/services/data-transfer-format';

export const PATTERNS_INITIALIZED = 'patternsInitialized';

/**
 * Database service for managing IndexedDB storage using Dexie.js
 */
@Injectable({
  providedIn: 'root'
})
export class DatabaseService extends Dexie {
  songSheets!: Table<SongSheet, string>;
  playingPatterns!: Table<PlayingPattern, string>;
  metadata!: Table<{ key: string; value: boolean }, string>;

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

    this.version(9).stores({
      songSheets: 'id, created, updated',
      playingPatterns: 'id, category, isCustom'
    }).upgrade(async tx => {
      await tx.table('playingPatterns').toCollection().modify(pattern => {
        (pattern as PlayingPattern).measures?.forEach(migrateMeasureLegatoStringIndices);
      });
      await tx.table('songSheets').toCollection().modify(sheet => {
        migrateSongSheetToCurrentFormat(sheet as RawSongSheetWithLegacyParts);
      });
    });

    this.version(10).stores({
      metadata: 'key'
    }).upgrade(async tx => {
      // Existing installations own their current library, including an empty one.
      await tx.table('metadata').put({ key: PATTERNS_INITIALIZED, value: true });
    });
  }

  async initializePatterns(): Promise<void> {
    await this.transaction('rw', [this.playingPatterns, this.metadata], async () => {
      if (await this.metadata.get(PATTERNS_INITIALIZED)) return;
      if (await this.playingPatterns.count() === 0) {
        await this.playingPatterns.bulkAdd(createDefaultPlayingPatterns());
      }
      await this.metadata.put({ key: PATTERNS_INITIALIZED, value: true });
    });
  }

  readPracticeData(): Promise<PracticeData> {
    return this.transaction('r', [this.songSheets, this.playingPatterns], async () => ({
      songSheets: await this.songSheets.toArray(),
      playingPatterns: await this.playingPatterns.toArray()
    }));
  }

  async restorePracticeData(data: PracticeData, mode: 'merge' | 'replace'): Promise<void> {
    await this.transaction('rw', [this.songSheets, this.playingPatterns, this.metadata], async () => {
      if (mode === 'replace') {
        await this.songSheets.clear();
        await this.playingPatterns.clear();
      }
      await this.songSheets.bulkPut(data.songSheets);
      await this.playingPatterns.bulkPut(data.playingPatterns);
      await this.metadata.put({ key: PATTERNS_INITIALIZED, value: true });
    });
  }
}

interface LegacySongPartMeasureText {
  measureIndex: number;
  lyrics: string;
  notes: string;
}

interface LegacySongPartPatternItem {
  id: string;
  patternId: string;
  measureTexts?: LegacySongPartMeasureText[];
  actionGrips?: SongPartActionGrip[];
}

interface LegacySongPart {
  id: string;
  section: string;
  lyrics?: string;
  notes?: string;
  items?: LegacySongPartPatternItem[];
  measures?: SongPartMeasure[];
}

interface RawSongSheetWithLegacyParts extends Omit<SongSheet, 'parts'> {
  parts?: LegacySongPart[];
}

export function migrateSongSheetPartsToMeasures(sheet: RawSongSheetWithLegacyParts): void {
  if (!Array.isArray(sheet.parts)) {
    return;
  }

  sheet.parts = sheet.parts.map(part => {
    if (Array.isArray(part.measures) && !Array.isArray(part.items)) {
      return part;
    }

    const measures = (part.items ?? []).flatMap(item => migrateLegacyPartItemToMeasures(sheet, item));
    const measureTexts = (part.items ?? []).flatMap(item => item.measureTexts ?? []);
    const migratedPart: LegacySongPart = {
      id: part.id,
      section: part.section,
      lyrics: part.lyrics ?? combineMeasureText(measureTexts, 'lyrics'),
      notes: part.notes ?? combineMeasureText(measureTexts, 'notes'),
      measures
    };

    return migratedPart;
  });

  migrateSongPartMeasureActionGripsToMeasures(sheet);
  migrateSongPartMeasureTextToParts(sheet);
}

function migrateLegacyPartItemToMeasures(sheet: RawSongSheetWithLegacyParts, item: LegacySongPartPatternItem): SongPartMeasure[] {
  const pattern = sheet.patterns?.find(existing => existing.id === item.patternId);
  if (!pattern) {
    return [];
  }

  return pattern.measures.map((measure, measureIndex) => ({
    id: createMigrationId('spm'),
    measure: {
      ...cloneMeasureForMigration(measure),
      actionGrips: mergeLegacyActionGrips(
        pattern.actionGrips ?? [],
        item.actionGrips ?? [],
        measureIndex
      )
    }
  }));
}

export function migrateSongPartMeasureTextToParts(sheet: RawSongSheetWithLegacyParts): void {
  if (!Array.isArray(sheet.parts)) {
    return;
  }

  sheet.parts.forEach(part => {
    const measures = part.measures ?? [];
    part.lyrics = part.lyrics ?? combineMeasureTextFromMeasures(measures, 'lyrics');
    part.notes = part.notes ?? combineMeasureTextFromMeasures(measures, 'notes');

    measures.forEach(partMeasure => {
      const legacyMeasure = partMeasure as SongPartMeasure & { lyrics?: string; notes?: string };
      delete legacyMeasure.lyrics;
      delete legacyMeasure.notes;
    });
  });
}

export function migrateSongPartMeasureActionGripsToMeasures(sheet: RawSongSheetWithLegacyParts): void {
  if (!Array.isArray(sheet.parts)) {
    return;
  }

  sheet.parts.forEach(part => {
    part.measures?.forEach(partMeasure => {
      const legacyMeasure = partMeasure as SongPartMeasure & { actionGrips?: SongPartActionGrip[] };
      const measureActionGrips = partMeasure.measure.actionGrips ?? [];
      const legacyActionGrips = legacyMeasure.actionGrips ?? [];
      const merged = mergeMeasureActionGrips(measureActionGrips, legacyActionGrips);

      partMeasure.measure.actionGrips = merged;
      delete legacyMeasure.actionGrips;
    });
  });
}

function mergeMeasureActionGrips(
  measureGrips: SongPartActionGrip[],
  legacyGrips: SongPartActionGrip[]
): SongPartActionGrip[] {
  const merged = new Map<number, SongPartActionGrip>();

  for (const grip of measureGrips) {
    merged.set(grip.actionIndex, { ...grip, measureIndex: 0 });
  }

  for (const grip of legacyGrips) {
    merged.set(grip.actionIndex, { ...grip, measureIndex: 0 });
  }

  return [...merged.values()].sort((left, right) => left.actionIndex - right.actionIndex);
}

function combineMeasureTextFromMeasures(
  measures: SongPartMeasure[],
  field: 'lyrics' | 'notes'
): string {
  return measures
    .map(measure => (measure as SongPartMeasure & { lyrics?: string; notes?: string })[field]?.trim() ?? '')
    .filter(value => value.length > 0)
    .join('\n');
}

function combineMeasureText(
  measureTexts: LegacySongPartMeasureText[],
  field: 'lyrics' | 'notes'
): string {
  return [...measureTexts]
    .sort((left, right) => left.measureIndex - right.measureIndex)
    .map(text => text[field]?.trim() ?? '')
    .filter(value => value.length > 0)
    .join('\n');
}

function mergeLegacyActionGrips(
  patternGrips: SongPartActionGrip[],
  itemGrips: SongPartActionGrip[],
  measureIndex: number
): SongPartActionGrip[] {
  const merged = new Map<number, SongPartActionGrip>();

  for (const grip of patternGrips.filter(existing => existing.measureIndex === measureIndex)) {
    merged.set(grip.actionIndex, { ...grip, measureIndex: 0 });
  }

  for (const grip of itemGrips.filter(existing => existing.measureIndex === measureIndex)) {
    merged.set(grip.actionIndex, { ...grip, measureIndex: 0 });
  }

  return [...merged.values()].sort((left, right) => left.actionIndex - right.actionIndex);
}

function cloneMeasureForMigration(measure: Measure): Measure {
  return {
    ...measure,
    actionGrips: (measure.actionGrips ?? []).map(grip => ({ ...grip })),
    actions: measure.actions.map(action => {
      if (!action) {
        return null;
      }

      return {
        ...action,
        modifiers: action.modifiers ? [...action.modifiers] : undefined,
        strum: action.strum ? { ...action.strum } : undefined,
        pick: action.pick ? action.pick.map(note => ({ ...note })) : undefined,
        percussive: action.percussive ? { ...action.percussive } : undefined
      };
    })
  };
}

function createMigrationId(prefix: string): string {
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
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

/** Repair numeric option values persisted as text by the explicit legato selector. */
export function migrateMeasureLegatoStringIndices(measure: Measure): void {
  measure.actions?.forEach(action => {
    const legato = action?.legato;
    if (!legato || 'target' in legato) return;

    const stringIndex: unknown = legato.string;
    if (typeof stringIndex === 'string' && /^[0-5]$/.test(stringIndex)) {
      legato.string = Number(stringIndex);
    }
  });
}

export function migrateSongSheetLegatoStringIndices(sheet: SongSheet): void {
  sheet.patterns?.forEach(pattern => pattern.measures?.forEach(migrateMeasureLegatoStringIndices));
  sheet.parts?.forEach(part => part.measures?.forEach(partMeasure => {
    migrateMeasureLegatoStringIndices(partMeasure.measure);
  }));
}

/** Upgrade any pre-arrangement song shape directly to the current storage format. */
export function migrateSongSheetToCurrentFormat(sheet: RawSongSheetWithLegacyParts): void {
  migrateSongSheetPartsToMeasures(sheet);
  const currentSheet = sheet as SongSheet;
  currentSheet.parts ??= [];
  migrateSongArrangement(currentSheet);
  migrateSongSheetLegatoStringIndices(currentSheet);
}
