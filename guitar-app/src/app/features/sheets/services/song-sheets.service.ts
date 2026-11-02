import { Injectable } from '@angular/core';
import {
  ResolvedSongPartMeasure,
  SongPart,
  SongPartOccurrence,
  SongPartMeasure,
  SongSheetLink,
  SongSheet,
  SongSheetGrip,
  SongSheetGripWithData,
  SongSheetPattern,
  SongSheetWithData
} from '@/app/features/sheets/services/song-sheets.model';
import { note } from '@/app/core/music/semitones';
import { parseGrip } from '@/app/features/grips/services/grips/grip.model';
import { DatabaseService } from '@/app/core/services/database.service';
import { Measure } from '@/app/features/patterns/services/playing-patterns.model';
import { getSongArrangement, migrateSongArrangement } from './song-arrangement';
import { cloneMeasure } from '@/app/features/patterns/services/playing-pattern-clone';

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
      const sheets = await this.db.songSheets.toArray();
      sheets.forEach(migrateSongArrangement);
      return sheets;
    } catch (error) {
      console.error('Error loading song sheets:', error);
      return [];
    }
  }

  async getById(id: string): Promise<SongSheet | undefined> {
    try {
      const sheet = await this.db.songSheets.get(id);
      if (sheet) migrateSongArrangement(sheet);
      return sheet;
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
      name: grip.name,
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
      links: [],
      grips: [],
      patterns: [],
      parts: [],
      arrangement: [],
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
        name: grip.name
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
      measures: part.measures.map(measure => ({
        ...measure,
        measure: {
          ...measure.measure,
          actionGrips: (measure.measure.actionGrips ?? []).filter(grip => grip.gripId !== gripId)
        }
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

  /** A null boundary prepends; an omitted boundary appends. */
  async addOccurrence(sheetId: string, partId?: string, afterOccurrenceId?: string | null): Promise<SongPartOccurrence> {
    const sheet = await this.getById(sheetId);
    if (!sheet) throw new Error('Song sheet not found');
    let part = sheet.parts.find(item => item.id === partId);
    if (partId && !part) throw new Error('Song part not found');
    if (!part) {
      part = { id: this.createId('sp'), section: 'Untitled part', notes: '', measures: [] };
      sheet.parts.push(part);
    }
    const occurrence = { id: this.createId('occ'), partId: part.id, lyrics: '' };
    const arrangement = [...getSongArrangement(sheet)];
    const afterIndex = arrangement.findIndex(item => item.id === afterOccurrenceId);
    const insertIndex = afterOccurrenceId === null ? 0 : afterIndex < 0 ? arrangement.length : afterIndex + 1;
    arrangement.splice(insertIndex, 0, occurrence);
    sheet.arrangement = arrangement;
    await this.update(sheet);
    return occurrence;
  }

  async saveOccurrence(sheetId: string, occurrenceId: string, lyrics: string, music?: SongPart): Promise<void> {
    const sheet = await this.getById(sheetId);
    if (!sheet) throw new Error('Song sheet not found');
    const occurrence = getSongArrangement(sheet).find(item => item.id === occurrenceId);
    if (!occurrence) throw new Error('Song occurrence not found');
    if (music) {
      const cleanMusic = this.clonePart({ ...music, section: music.section.trim() || 'Untitled part', notes: music.notes.trim() });
      if (music.id === occurrence.partId) {
        const index = sheet.parts.findIndex(part => part.id === music.id);
        if (index < 0) throw new Error('Song part not found');
        sheet.parts[index] = cleanMusic;
      } else {
        if (sheet.parts.some(part => part.id === music.id)) throw new Error('Independent part must have a new identity');
        sheet.parts.push(cleanMusic);
        occurrence.partId = music.id;
      }
    }
    occurrence.lyrics = lyrics;
    await this.update(sheet);
  }

  async moveOccurrence(sheetId: string, from: number, to: number): Promise<void> {
    const sheet = await this.getById(sheetId);
    if (!sheet) return;
    const arrangement = getSongArrangement(sheet);
    if (from === to || from < 0 || to < 0 || from >= arrangement.length || to >= arrangement.length) return;
    const [occurrence] = arrangement.splice(from, 1);
    arrangement.splice(to, 0, occurrence);
    sheet.arrangement = arrangement;
    await this.update(sheet);
  }

  async removeOccurrence(sheetId: string, occurrenceId: string): Promise<void> {
    const sheet = await this.getById(sheetId);
    if (!sheet) return;
    sheet.arrangement = getSongArrangement(sheet).filter(occurrence => occurrence.id !== occurrenceId);
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

    const [removed] = sheet.parts.splice(partIndex, 1);
    sheet.arrangement = getSongArrangement(sheet).filter(occurrence => occurrence.partId !== removed.id);
    await this.update(sheet);
  }

  async duplicatePart(sheetId: string, partIndex: number): Promise<SongPart> {
    const sheet = await this.getById(sheetId);
    if (!sheet) {
      throw new Error('Song sheet not found');
    }

    const part = sheet.parts[partIndex];
    if (!part) {
      throw new Error('Song part not found on song sheet');
    }

    const copy: SongPart = {
      id: this.createId('sp'),
      section: part.section ? part.section + ' (Copy)' : 'Copy',
      notes: part.notes,
      measures: part.measures.map(measure => ({
        ...this.clonePartMeasure(measure),
        id: this.createId('spm')
      }))
    };

    sheet.parts.push(copy);
    await this.update(sheet);
    return copy;
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

  getPatternUsageCount(sheet: SongSheet | SongSheetWithData, patternId: string): number {
    void sheet;
    void patternId;
    return 0;
  }

  resolvePartMeasures(sheet: SongSheet | SongSheetWithData, part: SongPart): ResolvedSongPartMeasure[] {
    return part.measures.map((partMeasure, measureIndex) => ({
      measureId: partMeasure.id,
      measureIndex,
      measure: this.cloneMeasure(partMeasure.measure)
    }));
  }

  createMeasuresFromPattern(pattern: SongSheetPattern): SongPartMeasure[] {
    return pattern.measures.map((measure, measureIndex) => {
      const actionGrips = (pattern.actionGrips ?? [])
        .filter(grip => grip.measureIndex === measureIndex)
        .map(grip => ({ ...grip, measureIndex: 0 }));

      return {
        id: this.createId('spm'),
        measure: {
          ...this.cloneMeasure(measure),
          actionGrips
        }
      };
    });
  }

  createEmptyPartMeasure(timeSignature: Measure['timeSignature'] = '4/4'): SongPartMeasure {
    return {
      id: this.createId('spm'),
      measure: {
        timeSignature,
        actions: Array(timeSignature === '3/4' ? 12 : 16).fill(null),
        actionGrips: []
      }
    };
  }

  private cleanSheetForStorage(sheet: SongSheet): SongSheet {
    return {
      ...sheet,
      links: sheet.links.map(link => this.cloneLink(link)),
      grips: sheet.grips.map(grip => ({
        gripId: grip.gripId,
        name: grip.name
      })),
      patterns: sheet.patterns.map(pattern => this.clonePattern(pattern)),
      arrangement: getSongArrangement(sheet).map(occurrence => ({ ...occurrence })),
      parts: sheet.parts.map(part => this.clonePart(part))
    };
  }

  private clonePart(part: SongPart): SongPart {
    return {
      id: part.id,
      section: part.section,
      notes: part.notes,
      measures: part.measures.map(measure => this.clonePartMeasure(measure))
    };
  }

  private cloneLink(link: SongSheetLink): SongSheetLink {
    return {
      id: link.id,
      url: link.url,
      description: link.description
    };
  }

  private clonePartMeasure(measure: SongPartMeasure): SongPartMeasure {
    return {
      id: measure.id,
      measure: this.cloneMeasure(measure.measure)
    };
  }

  private clonePattern(pattern: SongSheetPattern): SongSheetPattern {
    return {
      ...pattern,
      actionGrips: (pattern.actionGrips ?? []).map(grip => ({ ...grip })),
      measures: pattern.measures.map(measure => this.cloneMeasure(measure))
    };
  }

  private cloneMeasure(measure: SongSheetPattern['measures'][number]) {
    return cloneMeasure(measure);
  }

  private createId(prefix: string): string {
    return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  }
}
