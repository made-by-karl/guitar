import { Injectable } from '@angular/core';
import { SongSheet, SongSheetGrip, SongSheetPattern, SongSheetWithData, SongSheetPatternWithData, SongSheetGripWithData, SongPart } from './song-sheets.model';
import { RhythmPatternsService } from './rhythm-patterns.service';
import { note } from 'app/common/semitones';
import { parseGrip } from './grips/grip.model';
import { DatabaseService } from './database.service';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SongSheetsService {
  private readonly defaultTuning = [
          note('E', 2),
          note('A', 2),
          note('D', 3),
          note('G', 3),
          note('B', 3),
          note('E', 4)];

  private pinnedSongSheetId: string | null = null;
  private pinnedSongSheet$ = new BehaviorSubject<SongSheet | undefined>(undefined);

  constructor(
    private rhythmPatternsService: RhythmPatternsService,
    private db: DatabaseService
  ) {}

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

  /**
   * Get a song sheet with data loaded
   */
  async getByIdWithData(id: string): Promise<SongSheetWithData | undefined> {
    const sheet = await this.getById(id);
    if (!sheet) return undefined;

    const gripsWithData: SongSheetGripWithData[] = sheet.grips.map(g => {
      const grip = parseGrip(g.gripId);
      return {
        gripId: g.gripId,
        chordName: g.chordName,
        grip: grip
      };
    });

    const patternsWithData: SongSheetPatternWithData[] = [];
    for (const p of sheet.patterns) {
      const pattern = await this.rhythmPatternsService.getById(p.patternId);
      patternsWithData.push({
        patternId: p.patternId,
        pattern: pattern
      });
    }

    return {
      ...sheet,
      grips: gripsWithData,
      patterns: patternsWithData
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
      sheet.updated = Date.now();
      // Ensure we only store pattern references, not full pattern objects
      const cleanSheet = this.cleanSheetForStorage(sheet);
      await this.db.songSheets.put(cleanSheet);
    } catch (error) {
      console.error('Error updating song sheet:', error);
      throw error;
    }
  }

  /**
   * Ensure only pattern IDs are stored, removing any accidentally included pattern data
   */
  private cleanSheetForStorage(sheet: SongSheet): SongSheet {
    return {
      ...sheet,
      patterns: sheet.patterns.map(p => ({
        patternId: p.patternId
      }))
    };
  }

  async delete(id: string): Promise<void> {
    try {
      await this.db.songSheets.delete(id);
    } catch (error) {
      console.error('Error deleting song sheet:', error);
      throw error;
    }
  }

  pinSongSheet(id: string) {
    this.pinnedSongSheetId = id;
    this.emitPinnedSheet();
  }

  unpinSongSheet() {
    this.pinnedSongSheetId = null;
    this.pinnedSongSheet$.next(undefined);
  }

  async getPinnedSongSheet(): Promise<SongSheet | undefined> {
    if (!this.pinnedSongSheetId) return undefined;
    return await this.getById(this.pinnedSongSheetId);
  }

  observePinnedSongSheet(): Observable<SongSheet | undefined> {
    return this.pinnedSongSheet$.asObservable();
  }

  private async emitPinnedSheet() {
    const sheet = await this.getPinnedSongSheet();
    this.pinnedSongSheet$.next(sheet);
  }

  isPinned(id: string): boolean {
    return this.pinnedSongSheetId === id;
  }

  async addGrip(grip: SongSheetGrip, songSheetId?: string): Promise<void> {
    const id = songSheetId || this.pinnedSongSheetId;
    if (!id) return;
    const sheet = await this.getById(id);
    if (sheet) {
      sheet.grips = sheet.grips || [];
      // Ensure we only store the grip reference
      const cleanGrip: SongSheetGrip = {
        gripId: grip.gripId,
        chordName: grip.chordName
      };
      sheet.grips.push(cleanGrip);
      await this.update(sheet);
    }
  }

  async removeGrip(sheetId: string, gripId: string): Promise<void> {
    const sheet = await this.getById(sheetId);
    if (sheet) {
      sheet.grips = sheet.grips.filter(g => g.gripId !== gripId);
      await this.update(sheet);
    }
  }

  async moveGrip(sheetId: string, fromIndex: number, toIndex: number): Promise<void> {
    const sheet = await this.getById(sheetId);
    if (sheet && sheet.grips && fromIndex >= 0 && fromIndex < sheet.grips.length && 
        toIndex >= 0 && toIndex < sheet.grips.length) {
      const item = sheet.grips.splice(fromIndex, 1)[0];
      sheet.grips.splice(toIndex, 0, item);
      await this.update(sheet);
    }
  }

  async movePattern(sheetId: string, fromIndex: number, toIndex: number): Promise<void> {
    const sheet = await this.getById(sheetId);
    if (sheet && sheet.patterns && fromIndex >= 0 && fromIndex < sheet.patterns.length && 
        toIndex >= 0 && toIndex < sheet.patterns.length) {
      const item = sheet.patterns.splice(fromIndex, 1)[0];
      sheet.patterns.splice(toIndex, 0, item);
      await this.update(sheet);
    }
  }

  async movePart(sheetId: string, fromIndex: number, toIndex: number): Promise<void> {
    const sheet = await this.getById(sheetId);
    if (sheet && sheet.parts && fromIndex >= 0 && fromIndex < sheet.parts.length && 
        toIndex >= 0 && toIndex < sheet.parts.length) {
      const item = sheet.parts.splice(fromIndex, 1)[0];
      sheet.parts.splice(toIndex, 0, item);
      await this.update(sheet);
    }
  }

  async rename(sheetId: string, newName: string): Promise<void> {
    const sheet = await this.getById(sheetId);
    if (sheet) {
      sheet.name = newName;
      await this.update(sheet);
    }
  }

  async addPattern(pattern: SongSheetPattern, songSheetId?: string): Promise<void> {
    const id = songSheetId || this.pinnedSongSheetId;
    if (!id) return;
    const sheet = await this.getById(id);
    if (sheet) {
      sheet.patterns = sheet.patterns || [];
      // Ensure we only store the pattern reference
      const cleanPattern: SongSheetPattern = {
        patternId: pattern.patternId
      };
      sheet.patterns.push(cleanPattern);
      await this.update(sheet);
    }
  }

  async removePattern(sheetId: string, patternId: string): Promise<void> {
    const sheet = await this.getById(sheetId);
    if (sheet && sheet.patterns) {
      sheet.patterns = sheet.patterns.filter(p => p.patternId !== patternId);
      await this.update(sheet);
    }
  }

  async getPatterns(sheetId: string): Promise<SongSheetPattern[]> {
    const sheet = await this.getById(sheetId);
    return sheet?.patterns || [];
  }

  // Song parts management
  async addPart(sheetId: string, part: SongPart): Promise<void> {
    const sheet = await this.getById(sheetId);
    if (sheet) {
      sheet.parts = sheet.parts || [];
      sheet.parts.push(part);
      await this.update(sheet);
    }
  }

  async updatePart(sheetId: string, partIndex: number, part: SongPart): Promise<void> {
    const sheet = await this.getById(sheetId);
    if (sheet && sheet.parts && partIndex >= 0 && partIndex < sheet.parts.length) {
      sheet.parts[partIndex] = part;
      await this.update(sheet);
    }
  }

  async removePart(sheetId: string, partIndex: number): Promise<void> {
    const sheet = await this.getById(sheetId);
    if (sheet && sheet.parts && partIndex >= 0 && partIndex < sheet.parts.length) {
      sheet.parts.splice(partIndex, 1);
      await this.update(sheet);
    }
  }
}
