import { expect, test } from '@playwright/test';
import type { SongSheet } from '../src/app/features/sheets/services/song-sheets.model';
import type { PlayingPattern } from '../src/app/features/patterns/services/playing-patterns.model';

for (const version of [4, 7, 9]) {
  test(`opens a version-${version} database with the consolidated song migration`, async ({ page }) => {
    // Establish the application origin without starting Angular or Dexie.
    await page.goto('/icons/icon-96x96.png');
    await page.evaluate(async version => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('GuitarAppDatabase', version * 10);
        request.onupgradeneeded = () => {
          const sheets = request.result.createObjectStore('songSheets', { keyPath: 'id' });
          sheets.createIndex('created', 'created'); sheets.createIndex('updated', 'updated');
          const patterns = request.result.createObjectStore('playingPatterns', { keyPath: 'id' });
          patterns.createIndex('category', 'category'); patterns.createIndex('isCustom', 'isCustom');
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const measure = {
        timeSignature: '4/4',
        actions: [{ technique: 'slide', legatoMode: 'explicit', legato: { string: version === 9 ? 2 : '2', toFret: 7 } }, ...Array(15).fill(null)],
        actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: 'x|x|o|2|3|2', name: 'D' }]
      };
      const pattern = {
        id: 'saved-pattern', name: 'Saved pattern', description: '', category: 'Custom', isCustom: true,
        suggestedGenre: '', exampleSong: '', measures: [measure], actionGrips: measure.actionGrips,
        createdAt: 1, updatedAt: 2
      };
      const parts = version === 4 ? [{
        id: 'verse', section: 'Verse', items: [{
          id: 'old-item', patternId: pattern.id, actionGrips: [],
          measureTexts: [{ measureIndex: 0, lyrics: 'First words', notes: 'Keep these notes' }]
        }]
      }] : [{
        id: 'verse', section: 'Verse', notes: 'Keep these notes',
        ...(version === 9 ? {} : { lyrics: 'First words' }),
        measures: [{ id: 'kept-measure-id', measure }]
      }];
      const sheet = {
        id: 'upgrade-song', name: 'Migration test', tuning: [], capodaster: 0, tempo: 90,
        links: [], grips: [], patterns: [pattern], parts, created: 1, updated: 2,
        ...(version === 9 ? { arrangement: [
          { id: 'kept-first', partId: 'verse', lyrics: 'First words' },
          { id: 'kept-second', partId: 'verse', lyrics: 'Second words' }
        ] } : {})
      };
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(['songSheets', 'playingPatterns'], 'readwrite');
        transaction.objectStore('songSheets').put(sheet);
        transaction.objectStore('playingPatterns').put(pattern);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    }, version);
    await page.goto('/sheets/upgrade-song');
    await expect(page.locator('app-song-arrangement .occurrence-row')).toHaveCount(version === 9 ? 2 : 1);
    const snapshot = await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('GuitarAppDatabase');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const read = <T,>(table: string, id: string) => new Promise<T>((resolve, reject) => {
        const request = database.transaction(table).objectStore(table).get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const sheet = await read<SongSheet>('songSheets', 'upgrade-song');
      const pattern = await read<PlayingPattern>('playingPatterns', 'saved-pattern');
      const snapshot = { version: database.version, sheet, pattern };
      database.close();
      return snapshot;
    });
    expect(snapshot.version).toBe(100);
    expect(snapshot.sheet.parts[0]).not.toHaveProperty('items');
    expect(snapshot.sheet.parts[0].lyrics).toBeUndefined();
    expect(snapshot.sheet.parts[0].notes).toBe('Keep these notes');
    expect(snapshot.sheet.parts[0].measures[0].measure.actions[0]?.legato?.string).toBe(2);
    expect(snapshot.sheet.patterns[0].measures[0].actions[0]?.legato?.string).toBe(2);
    expect(snapshot.pattern.measures[0].actions[0]?.legato?.string).toBe(2);
    expect(snapshot.sheet.arrangement!.map((item: { lyrics: string }) => item.lyrics)).toEqual(
      version === 9 ? ['First words', 'Second words'] : ['First words']
    );
    expect(snapshot.sheet.updated).toBe(2);
    if (version !== 4) expect(snapshot.sheet.parts[0].measures[0].id).toBe('kept-measure-id');
    if (version === 9) expect(snapshot.sheet.arrangement!.map((item: { id: string }) => item.id)).toEqual(['kept-first', 'kept-second']);
    await page.reload();
    await expect(page.locator('app-song-arrangement .occurrence-row')).toHaveCount(version === 9 ? 2 : 1);
  });
}
