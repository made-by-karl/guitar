import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { SongSheet } from '@/app/services/song-sheets.model';
import { RhythmPattern } from '@/app/services/rhythm-patterns.model';

/**
 * Database service for managing IndexedDB storage using Dexie.js
 */
@Injectable({
  providedIn: 'root'
})
export class DatabaseService extends Dexie {
  songSheets!: Table<SongSheet, string>;
  rhythmPatterns!: Table<RhythmPattern, string>;

  constructor() {
    super('GuitarAppDatabase');
    
    // Define database schema
    this.version(1).stores({
      songSheets: 'id, created, updated',
      rhythmPatterns: 'id, category, isCustom'
    });
  }
}
