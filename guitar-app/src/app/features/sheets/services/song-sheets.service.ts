import { Injectable } from '@angular/core';
import {
  ResolvedSongPartMeasure,
  SongPart,
  SongPartActionGrip,
  SongPartBeatGrip,
  SongPartMeasureText,
  SongPartPatternItem,
  SongSheet,
  SongSheetGrip,
  SongSheetGripWithData,
  SongSheetPattern,
  SongSheetWithData
} from '@/app/features/sheets/services/song-sheets.model';
import { note } from '@/app/core/music/semitones';
import { parseGrip } from '@/app/features/grips/services/grips/grip.model';
import { DatabaseService } from '@/app/core/services/database.service';
import { getBeatsFromTimeSignature } from '@/app/features/patterns/services/rhythm-patterns.model';

@Injectable({ providedIn: 'root' })
export class SongSheetsService {
  private readonly defaultTuning = [
    note('E', 2),
    note('A', 2),
    note('D', 3),
    note('G', 3),
    note('B', 3),
    note('E', 4)
  ];

  constructor(private db: DatabaseService) {}

  async getAll(): Promise<SongSheet[]> {
    try {
      return await this.db.songSheets.toArray();
    } catch (error) {
      console.error('Error loading song sheets:', error);
      return [];
    }
  }

  async getById(id: string): Promise<SongSheet | undefined> {
    try {
      return await this.db.songSheets.get(id);
    } catch (error) {
      console.error('Error loading song sheet:', error);
      return undefined;
    }
  }

  async getByIdWithData(id: string): Promise<SongSheetWithData | undefined> {
    const sheet = await this.getById(id);
    if (!sheet) {
      return undefined;
    }

    const gripsWithData: SongSheetGripWithData[] = sheet.grips.map(grip => ({
      gripId: grip.gripId,
      chordName: grip.chordName,
      grip: parseGrip(grip.gripId)
    }));

    return {
      ...sheet,
      grips: gripsWithData
    };
  }

  async create(name: string): Promise<SongSheet> {
    const now = Date.now();
    const sheet: SongSheet = {
      id: 'ss-' + now + '-' + Math.random().toString(36).slice(2, 8),
      name,
      tuning: this.defaultTuning,
      capodaster: 0,
      tempo: 80,
      grips: [],
      patterns: [],
      parts: [],
      created: now,
      updated: now
    };

    try {
      await this.db.songSheets.add(sheet);
      return sheet;
    } catch (error) {
      console.error('Error creating song sheet:', error);
      throw error;
    }
  }

  async update(sheet: SongSheet): Promise<void> {
    try {
      const cleanSheet = this.cleanSheetForStorage({
        ...sheet,
        updated: Date.now()
      });
      await this.db.songSheets.put(cleanSheet);
    } catch (error) {
      console.error('Error updating song sheet:', error);
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.db.songSheets.delete(id);
    } catch (error) {
      console.error('Error deleting song sheet:', error);
      throw error;
    }
  }

  async addGrips(grips: SongSheetGrip[], songSheetId: string): Promise<void> {
    const sheet = await this.getById(songSheetId);
    if (!sheet) {
      return;
    }

    let changed = false;
    for (const grip of grips) {
      const cleanGrip: SongSheetGrip = {
        gripId: grip.gripId,
        chordName: grip.chordName
      };

      if (!sheet.grips.find(existing => existing.gripId === grip.gripId)) {
        sheet.grips.push(cleanGrip);
        changed = true;
      }
    }

    if (changed) {
      await this.update(sheet);
    }
  }

  async addGrip(grip: SongSheetGrip, songSheetId: string): Promise<void> {
    await this.addGrips([grip], songSheetId);
  }

  async removeGrip(sheetId: string, gripId: string): Promise<void> {
    const sheet = await this.getById(sheetId);
    if (!sheet) {
      return;
    }

    sheet.grips = sheet.grips.filter(grip => grip.gripId !== gripId);
    sheet.parts = sheet.parts.map(part => ({
      ...part,
      items: part.items.map(item => ({
        ...item,
        beatGrips: item.beatGrips.filter(grip => grip.gripId !== gripId),
        actionGripOverrides: item.actionGripOverrides.filter(grip => grip.gripId !== gripId)
      }))
    }));

    await this.update(sheet);
  }

  async moveGrip(sheetId: string, fromIndex: number, toIndex: number): Promise<void> {
    const sheet = await this.getById(sheetId);
    if (!sheet || fromIndex === toIndex || fromIndex < 0 || toIndex < 0 ||
      fromIndex >= sheet.grips.length || toIndex >= sheet.grips.length) {
      return;
    }

    const item = sheet.grips.splice(fromIndex, 1)[0];
    sheet.grips.splice(toIndex, 0, item);
    await this.update(sheet);
  }

  async addPatterns(patterns: SongSheetPattern[], songSheetId: string): Promise<void> {
    const sheet = await this.getById(songSheetId);
    if (!sheet) {
      return;
    }

    let changed = false;
    for (const pattern of patterns) {
      if (!sheet.patterns.find(existing => existing.id === pattern.id)) {
        sheet.patterns.push(this.clonePattern(pattern));
        changed = true;
      }
    }

    if (changed) {
      await this.update(sheet);
    }
  }

  async addPattern(pattern: SongSheetPattern, songSheetId: string): Promise<void> {
    await this.addPatterns([pattern], songSheetId);
  }

  async updatePattern(sheetId: string, pattern: SongSheetPattern): Promise<void> {
    const sheet = await this.getById(sheetId);
    if (!sheet) {
      return;
    }

    const patternIndex = sheet.patterns.findIndex(existing => existing.id === pattern.id);
    if (patternIndex === -1) {
      throw new Error('Pattern not found on song sheet');
    }

    sheet.patterns[patternIndex] = this.clonePattern({
      ...pattern,
      updatedAt: Date.now()
    });
    await this.update(sheet);
  }

  async duplicatePattern(sheetId: string, patternId: string, nameSuffix: string = 'Variation'): Promise<SongSheetPattern> {
    const sheet = await this.getById(sheetId);
    if (!sheet) {
      throw new Error('Song sheet not found');
    }

    const pattern = sheet.patterns.find(existing => existing.id === patternId);
    if (!pattern) {
      throw new Error('Pattern not found on song sheet');
    }

    const copy = this.clonePattern({
      ...pattern,
      id: this.createId('sp'),
      name: pattern.name ? pattern.name + ' (' + nameSuffix + ')' : nameSuffix,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isCustom: true
    });

    sheet.patterns.push(copy);
    await this.update(sheet);
    return copy;
  }

  async removePattern(sheetId: string, patternId: string): Promise<void> {
    const sheet = await this.getById(sheetId);
    if (!sheet) {
      return;
    }

    if (this.getPatternUsageCountFromSheet(sheet, patternId) > 0) {
      throw new Error('Pattern is still used in song parts');
    }

    sheet.patterns = sheet.patterns.filter(pattern => pattern.id !== patternId);
    await this.update(sheet);
  }

  async movePattern(sheetId: string, fromIndex: number, toIndex: number): Promise<void> {
    const sheet = await this.getById(sheetId);
    if (!sheet || fromIndex === toIndex || fromIndex < 0 || toIndex < 0 ||
      fromIndex >= sheet.patterns.length || toIndex >= sheet.patterns.length) {
      return;
    }

    const item = sheet.patterns.splice(fromIndex, 1)[0];
    sheet.patterns.splice(toIndex, 0, item);
    await this.update(sheet);
  }

  async getPatterns(sheetId: string): Promise<SongSheetPattern[]> {
    const sheet = await this.getById(sheetId);
    return sheet?.patterns ?? [];
  }

  async addPart(sheetId: string, part: SongPart): Promise<void> {
    const sheet = await this.getById(sheetId);
    if (!sheet) {
      return;
    }

    sheet.parts.push(this.clonePart(part));
    await this.update(sheet);
  }

  async updatePart(sheetId: string, partIndex: number, part: SongPart): Promise<void> {
    const sheet = await this.getById(sheetId);
    if (!sheet || partIndex < 0 || partIndex >= sheet.parts.length) {
      return;
    }

    sheet.parts[partIndex] = this.clonePart(part);
    await this.update(sheet);
  }

  async removePart(sheetId: string, partIndex: number): Promise<void> {
    const sheet = await this.getById(sheetId);
    if (!sheet || partIndex < 0 || partIndex >= sheet.parts.length) {
      return;
    }

    sheet.parts.splice(partIndex, 1);
    await this.update(sheet);
  }

  async movePart(sheetId: string, fromIndex: number, toIndex: number): Promise<void> {
    const sheet = await this.getById(sheetId);
    if (!sheet || fromIndex === toIndex || fromIndex < 0 || toIndex < 0 ||
      fromIndex >= sheet.parts.length || toIndex >= sheet.parts.length) {
      return;
    }

    const item = sheet.parts.splice(fromIndex, 1)[0];
    sheet.parts.splice(toIndex, 0, item);
    await this.update(sheet);
  }

  async replacePatternForPartItem(sheetId: string, partIndex: number, itemId: string, patternId: string): Promise<void> {
    const sheet = await this.getById(sheetId);
    if (!sheet || partIndex < 0 || partIndex >= sheet.parts.length) {
      return;
    }

    const item = sheet.parts[partIndex].items.find(existing => existing.id === itemId);
    if (!item) {
      return;
    }

    item.patternId = patternId;
    this.normalizePartItem(item, sheet.patterns.find(pattern => pattern.id === patternId));
    await this.update(sheet);
  }

  getPatternUsageCount(sheet: SongSheet | SongSheetWithData, patternId: string): number {
    return this.getPatternUsageCountFromSheet(sheet as SongSheet, patternId);
  }

  resolvePartItem(sheet: SongSheet | SongSheetWithData, item: SongPartPatternItem): ResolvedSongPartMeasure[] {
    const pattern = sheet.patterns.find(existing => existing.id === item.patternId);
    if (!pattern) {
      return [];
    }

    const normalizedItem = this.clonePartItem(item);
    this.normalizePartItem(normalizedItem, pattern);

    return pattern.measures.map((measure, measureIndex) => ({
      itemId: normalizedItem.id,
      itemIndex: measureIndex,
      patternId: pattern.id,
      patternName: pattern.name,
      measureIndex,
      measure: this.cloneMeasure(measure),
      lyrics: normalizedItem.measureTexts.find(text => text.measureIndex === measureIndex)?.lyrics ?? '',
      notes: normalizedItem.measureTexts.find(text => text.measureIndex === measureIndex)?.notes ?? '',
      beatGrips: normalizedItem.beatGrips.filter(grip => grip.measureIndex === measureIndex),
      actionGripOverrides: normalizedItem.actionGripOverrides.filter(grip => grip.measureIndex === measureIndex)
    }));
  }

  createPatternItem(pattern: SongSheetPattern): SongPartPatternItem {
    return {
      id: this.createId('spi'),
      patternId: pattern.id,
      measureTexts: pattern.measures.map((_, measureIndex) => ({
        measureIndex,
        lyrics: '',
        notes: ''
      })),
      beatGrips: [],
      actionGripOverrides: []
    };
  }

  normalizePartItem(item: SongPartPatternItem, pattern: SongSheetPattern | undefined): SongPartPatternItem {
    if (!pattern) {
      item.measureTexts = [];
      item.beatGrips = [];
      item.actionGripOverrides = [];
      return item;
    }

    const existingMeasureTexts = new Map(item.measureTexts.map(text => [text.measureIndex, text]));
    item.measureTexts = pattern.measures.map((_, measureIndex) => {
      const existing = existingMeasureTexts.get(measureIndex);
      return {
        measureIndex,
        lyrics: existing?.lyrics ?? '',
        notes: existing?.notes ?? ''
      };
    });

    item.beatGrips = item.beatGrips.filter(grip => {
      const measure = pattern.measures[grip.measureIndex];
      return !!measure && grip.beatIndex >= 0 && grip.beatIndex < getBeatsFromTimeSignature(measure.timeSignature);
    });

    item.actionGripOverrides = item.actionGripOverrides.filter(grip => {
      const measure = pattern.measures[grip.measureIndex];
      return !!measure && grip.actionIndex >= 0 && grip.actionIndex < measure.actions.length;
    });

    return item;
  }

  private cleanSheetForStorage(sheet: SongSheet): SongSheet {
    return {
      ...sheet,
      grips: sheet.grips.map(grip => ({
        gripId: grip.gripId,
        chordName: grip.chordName
      })),
      patterns: sheet.patterns.map(pattern => this.clonePattern(pattern)),
      parts: sheet.parts.map(part => this.clonePart(part))
    };
  }

  private clonePart(part: SongPart): SongPart {
    return {
      id: part.id,
      section: part.section,
      items: part.items.map(item => this.clonePartItem(item))
    };
  }

  private clonePartItem(item: SongPartPatternItem): SongPartPatternItem {
    return {
      id: item.id,
      patternId: item.patternId,
      measureTexts: item.measureTexts.map(text => ({ ...text })),
      beatGrips: item.beatGrips.map(grip => ({ ...grip })),
      actionGripOverrides: item.actionGripOverrides.map(grip => ({ ...grip }))
    };
  }

  private clonePattern(pattern: SongSheetPattern): SongSheetPattern {
    return {
      ...pattern,
      measures: pattern.measures.map(measure => this.cloneMeasure(measure))
    };
  }

  private cloneMeasure(measure: SongSheetPattern['measures'][number]) {
    return {
      ...measure,
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

  private getPatternUsageCountFromSheet(sheet: SongSheet, patternId: string): number {
    return sheet.parts.reduce((count, part) => (
      count + part.items.filter(item => item.patternId === patternId).length
    ), 0);
  }

  private createId(prefix: string): string {
    return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  }
}
