import { getOccurrenceNumber, getSongArrangement, migrateSongArrangement } from '@/app/features/sheets/services/song-arrangement';
import { SongSheet } from '@/app/features/sheets/services/song-sheets.model';

describe('Song arrangement migration', () => {
  const legacy = (): SongSheet => ({ id: 'sheet', name: 'Song', tuning: [], capodaster: 0, tempo: 90, links: [], grips: [], patterns: [], created: 0, updated: 0,
    parts: [
      { id: 'verse', section: 'Verse', lyrics: 'Original words', notes: 'Softly', measures: [{ id: 'm', measure: { timeSignature: '4/4', actions: [null] } }] },
      { id: 'chorus', section: 'Chorus', lyrics: 'Chorus words', notes: '', measures: [] }
    ] });

  it('preserves order, lyrics, notes and music, and is idempotent', () => {
    const sheet = legacy();
    const measure = sheet.parts[0].measures[0];
    migrateSongArrangement(sheet);
    expect(sheet.arrangement?.map(item => [item.partId, item.lyrics])).toEqual([['verse', 'Original words'], ['chorus', 'Chorus words']]);
    expect(sheet.parts[0].notes).toBe('Softly');
    expect(sheet.parts[0].measures[0]).toBe(measure);
    expect(sheet.parts[0]).not.toHaveProperty('lyrics');
    const snapshot = JSON.stringify(sheet);
    migrateSongArrangement(sheet);
    expect(JSON.stringify(sheet)).toBe(snapshot);
  });

  it('keeps an explicitly empty arrangement empty even if unused parts exist', () => {
    const sheet = { ...legacy(), arrangement: [] };
    migrateSongArrangement(sheet);
    expect(getSongArrangement(sheet)).toEqual([]);
    expect(sheet.parts).toHaveLength(2);
  });

  it('numbers occurrences per part identity and distinguishes a real name ending in a number', () => {
    const arrangement = [
      { id: 'v1', partId: 'verse', lyrics: 'One' }, { id: 'c1', partId: 'chorus', lyrics: '' },
      { id: 'v2', partId: 'verse', lyrics: 'Two' }, { id: 'clone', partId: 'literal-verse-2', lyrics: '' }
    ];
    expect(arrangement.map(item => getOccurrenceNumber(arrangement, item))).toEqual([1, 1, 2, 1]);
  });
});
