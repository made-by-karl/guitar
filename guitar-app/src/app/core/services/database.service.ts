import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { SongSheet } from '@/app/features/sheets/services/song-sheets.model';
import { PlayingPattern } from '@/app/features/patterns/services/playing-patterns.model';

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
    });
  }
}
