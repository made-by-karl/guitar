import { Injectable } from '@angular/core';
import { SongSheet, SongSheetGrip, SongSheetPattern } from './song-sheets.model';

@Injectable({ providedIn: 'root' })
export class SongSheetsService {
  private readonly STORAGE_KEY = 'guitar-app-song-sheets';
  private sheets: SongSheet[] = [];
  private loaded = false;
  private pinnedSongSheetId: string | null = null;

  constructor() {
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

  create(name: string): SongSheet {
    const now = Date.now();
    const sheet: SongSheet = {
      id: 'ss-' + now + '-' + Math.random().toString(36).slice(2, 8),
      name,
      grips: [],
      patterns: [],
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
      this.sheets[idx] = { ...sheet };
      this.save();
    }
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
      sheet.grips.push(grip);
      this.update(sheet);
    }
  }

  removeGrip(sheetId: string, gripId: string) {
    const sheet = this.getById(sheetId);
    if (sheet) {
      sheet.grips = sheet.grips.filter(g => g.id !== gripId);
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
      sheet.patterns.push(pattern);
      this.update(sheet);
    }
  }

  removePattern(sheetId: string, patternId: string) {
    const sheet = this.getById(sheetId);
    if (sheet && sheet.patterns) {
      sheet.patterns = sheet.patterns.filter(p => p.id !== patternId);
      this.update(sheet);
    }
  }

  getPatterns(sheetId: string): SongSheetPattern[] {
    const sheet = this.getById(sheetId);
    return sheet?.patterns || [];
  }
}
