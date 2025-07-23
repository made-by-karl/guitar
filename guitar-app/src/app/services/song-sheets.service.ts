import { Injectable } from '@angular/core';
import { SongSheet, SongSheetGrip, SongSheetPattern, SongSheetWithData, SongSheetPatternWithData, SongSheetGripWithData, SongPart } from './song-sheets.model';
import { RhythmPatternsService } from './rhythm-patterns.service';
import { note } from 'app/common/semitones';
import { parseGrip } from './grips/grip.model';

@Injectable({ providedIn: 'root' })
export class SongSheetsService {
  private readonly STORAGE_KEY = 'guitar-app-song-sheets';
  private readonly defaultTuning = [
          note('E', 2),
          note('A', 2),
          note('D', 3),
          note('G', 3),
          note('B', 3),
          note('E', 4)];

  private sheets: SongSheet[] = [];
  private loaded = false;
  private pinnedSongSheetId: string | null = null;

  constructor(private rhythmPatternsService: RhythmPatternsService) {
    this.load();
  }

  private load() {
    const raw = localStorage.getItem(this.STORAGE_KEY);
    this.sheets = raw ? JSON.parse(raw) : [];
    this.loaded = true;
  }

  private save() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.sheets));
  }

  getAll(): SongSheet[] {
    return this.sheets.slice();
  }

  getById(id: string): SongSheet | undefined {
    return this.sheets.find(s => s.id === id);
  }

  /**
   * Get a song sheet with data loaded
   */
  getByIdWithData(id: string): SongSheetWithData | undefined {
    const sheet = this.getById(id);
    if (!sheet) return undefined;

    const gripsWithData: SongSheetGripWithData[] = sheet.grips.map(g => {
      const grip = parseGrip(g.gripId);
      return {
        gripId: g.gripId,
        chordName: g.chordName,
        grip: grip
      };
    });

    const patternsWithData: SongSheetPatternWithData[] = sheet.patterns.map(p => {
      const pattern = this.rhythmPatternsService.getById(p.patternId);
      return {
        patternId: p.patternId,
        pattern: pattern
      };
    });

    return {
      ...sheet,
      grips: gripsWithData,
      patterns: patternsWithData
    };
  }

  create(name: string): SongSheet {
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
    this.sheets.push(sheet);
    this.save();
    return sheet;
  }

  update(sheet: SongSheet) {
    const idx = this.sheets.findIndex(s => s.id === sheet.id);
    if (idx !== -1) {
      sheet.updated = Date.now();
      // Ensure we only store pattern references, not full pattern objects
      const cleanSheet = this.cleanSheetForStorage(sheet);
      this.sheets[idx] = { ...cleanSheet };
      this.save();
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

  delete(id: string) {
    this.sheets = this.sheets.filter(s => s.id !== id);
    this.save();
  }

  pinSongSheet(id: string) {
    this.pinnedSongSheetId = id;
  }

  unpinSongSheet() {
    this.pinnedSongSheetId = null;
  }

  getPinnedSongSheet(): SongSheet | undefined {
    if (!this.pinnedSongSheetId) return undefined;
    return this.getById(this.pinnedSongSheetId);
  }

  isPinned(id: string): boolean {
    return this.pinnedSongSheetId === id;
  }

  addGrip(grip: SongSheetGrip, songSheetId?: string) {
    const id = songSheetId || this.pinnedSongSheetId;
    if (!id) return;
    const sheet = this.getById(id);
    if (sheet) {
      sheet.grips = sheet.grips || [];
      // Ensure we only store the grip reference
      const cleanGrip: SongSheetGrip = {
        gripId: grip.gripId,
        chordName: grip.chordName
      };
      sheet.grips.push(cleanGrip);
      this.update(sheet);
    }
  }

  removeGrip(sheetId: string, gripId: string) {
    const sheet = this.getById(sheetId);
    if (sheet) {
      sheet.grips = sheet.grips.filter(g => g.gripId !== gripId);
      this.update(sheet);
    }
  }

  rename(sheetId: string, newName: string) {
    const sheet = this.getById(sheetId);
    if (sheet) {
      sheet.name = newName;
      this.update(sheet);
    }
  }

  addPattern(pattern: SongSheetPattern, songSheetId?: string) {
    const id = songSheetId || this.pinnedSongSheetId;
    if (!id) return;
    const sheet = this.getById(id);
    if (sheet) {
      sheet.patterns = sheet.patterns || [];
      // Ensure we only store the pattern reference
      const cleanPattern: SongSheetPattern = {
        patternId: pattern.patternId
      };
      sheet.patterns.push(cleanPattern);
      this.update(sheet);
    }
  }

  removePattern(sheetId: string, patternId: string) {
    const sheet = this.getById(sheetId);
    if (sheet && sheet.patterns) {
      sheet.patterns = sheet.patterns.filter(p => p.patternId !== patternId);
      this.update(sheet);
    }
  }

  getPatterns(sheetId: string): SongSheetPattern[] {
    const sheet = this.getById(sheetId);
    return sheet?.patterns || [];
  }

  // Song parts management
  addPart(sheetId: string, part: SongPart) {
    const sheet = this.getById(sheetId);
    if (sheet) {
      sheet.parts = sheet.parts || [];
      sheet.parts.push(part);
      this.update(sheet);
    }
  }

  updatePart(sheetId: string, partIndex: number, part: SongPart) {
    const sheet = this.getById(sheetId);
    if (sheet && sheet.parts && partIndex >= 0 && partIndex < sheet.parts.length) {
      sheet.parts[partIndex] = part;
      this.update(sheet);
    }
  }

  removePart(sheetId: string, partIndex: number) {
    const sheet = this.getById(sheetId);
    if (sheet && sheet.parts && partIndex >= 0 && partIndex < sheet.parts.length) {
      sheet.parts.splice(partIndex, 1);
      this.update(sheet);
    }
  }
}
