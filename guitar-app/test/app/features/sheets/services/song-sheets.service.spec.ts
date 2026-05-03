import { SongSheetsService } from '@/app/features/sheets/services/song-sheets.service';
import { SongPartPatternItem, SongSheet } from '@/app/features/sheets/services/song-sheets.model';

describe('SongSheetsService', () => {
  function createService(initialSheet?: SongSheet) {
    let storedSheet = initialSheet;

    const db = {
      songSheets: {
        toArray: jest.fn(async () => storedSheet ? [storedSheet] : []),
        get: jest.fn(async (id: string) => storedSheet?.id === id ? storedSheet : undefined),
        add: jest.fn(async (sheet: SongSheet) => {
          storedSheet = sheet;
        }),
        put: jest.fn(async (sheet: SongSheet) => {
          storedSheet = sheet;
        }),
        delete: jest.fn(async () => {
          storedSheet = undefined;
        })
      }
    };

    return {
      service: new SongSheetsService(db as any),
      getStoredSheet: () => storedSheet,
      db
    };
  }

  function createSheet(): SongSheet {
    return {
      id: 'sheet-1',
      name: 'Song',
      tuning: [],
      capodaster: 0,
      tempo: 90,
      grips: [
        { gripId: 'grip-c', name: 'C' },
        { gripId: 'grip-g', name: 'G' }
      ],
      patterns: [{
        id: 'pattern-1',
        name: 'Verse Pattern',
        description: '',
        category: '',
        suggestedGenre: '',
        exampleSong: '',
        measures: [
          { timeSignature: '4/4', actions: Array(16).fill(null) },
          { timeSignature: '3/4', actions: Array(12).fill(null) }
        ],
        actionGrips: [{ measureIndex: 1, actionIndex: 2, gripId: 'grip-g', name: 'G' }],
        createdAt: 1,
        updatedAt: 1
      }],
      parts: [],
      created: 1,
      updated: 1
    };
  }

  it('creates normalized pattern items from sheet-local patterns', () => {
    const { service } = createService();
    const sheet = createSheet();

    const item = service.createPatternItem(sheet.patterns[0]);

    expect(item.patternId).toBe('pattern-1');
    expect(item.measureTexts).toEqual([
      { measureIndex: 0, lyrics: '', notes: '' },
      { measureIndex: 1, lyrics: '', notes: '' }
    ]);
    expect(item.actionGrips).toEqual([]);
  });

  it('normalizes overlays and removes out-of-range action assignments', () => {
    const { service } = createService();
    const pattern = createSheet().patterns[0];
    const item: SongPartPatternItem = {
      id: 'item-1',
      patternId: pattern.id,
      measureTexts: [{ measureIndex: 1, lyrics: 'line', notes: '' }],
      actionGrips: [
        { measureIndex: 0, actionIndex: 15, gripId: 'grip-c', name: 'C' },
        { measureIndex: 1, actionIndex: 20, gripId: 'grip-g', name: 'G' }
      ]
    };

    service.normalizePartItem(item, pattern);

    expect(item.measureTexts).toEqual([
      { measureIndex: 0, lyrics: '', notes: '' },
      { measureIndex: 1, lyrics: 'line', notes: '' }
    ]);
    expect(item.actionGrips).toEqual([
      { measureIndex: 0, actionIndex: 15, gripId: 'grip-c', name: 'C' }
    ]);
  });

  it('resolves a part item by joining the pattern with arrangement overlays', () => {
    const { service } = createService();
    const sheet = createSheet();
    const item: SongPartPatternItem = {
      id: 'item-1',
      patternId: 'pattern-1',
      measureTexts: [
        { measureIndex: 0, lyrics: 'hello', notes: 'accent' },
        { measureIndex: 1, lyrics: '', notes: 'hold' }
      ],
      actionGrips: [{ measureIndex: 1, actionIndex: 2, gripId: 'grip-g', name: 'G' }]
    };

    const resolved = service.resolvePartItem(sheet, item);

    expect(resolved).toHaveLength(2);
    expect(resolved[0].patternName).toBe('Verse Pattern');
    expect(resolved[0].absoluteMeasureIndex).toBe(0);
    expect(resolved[0].lyrics).toBe('hello');
    expect(resolved[1].absoluteMeasureIndex).toBe(1);
    expect(resolved[1].notes).toBe('hold');
    expect(resolved[1].actionGrips[0].actionIndex).toBe(2);
    expect(resolved[1].patternActionGrips[0].actionIndex).toBe(2);
  });

  it('removes grip references from all part items when a grip is deleted', async () => {
    const sheet = createSheet();
    sheet.parts = [{
      id: 'part-1',
      section: 'Verse',
      items: [{
        id: 'item-1',
        patternId: 'pattern-1',
        measureTexts: [],
        actionGrips: [{ measureIndex: 0, actionIndex: 1, gripId: 'grip-c', name: 'C' }]
      }]
    }];

    const { service, getStoredSheet } = createService(sheet);

    await service.removeGrip('sheet-1', 'grip-c');

    expect(getStoredSheet()?.grips).toEqual([{ gripId: 'grip-g', name: 'G' }]);
    expect(getStoredSheet()?.parts[0].items[0].actionGrips).toEqual([]);
  });

  it('duplicates patterns with a new id and independent nested data', async () => {
    const sheet = createSheet();
    sheet.patterns[0].measures[0].actions[0] = {
      technique: 'strum',
      modifiers: ['accent'],
      strum: { direction: 'D', strings: 'all' }
    };
    const { service, getStoredSheet } = createService(sheet);

    const copy = await service.duplicatePattern('sheet-1', 'pattern-1', 'Copy');
    const storedSheet = getStoredSheet();
    const originalPattern = storedSheet?.patterns[0];
    const copiedPattern = storedSheet?.patterns[1];

    expect(copy.id).not.toBe('pattern-1');
    expect(copiedPattern?.id).toBe(copy.id);
    expect(copiedPattern?.name).toBe('Verse Pattern (Copy)');
    expect(copiedPattern?.isCustom).toBe(true);
    expect(copiedPattern?.measures).toEqual(originalPattern?.measures);
    expect(copiedPattern?.actionGrips).toEqual(originalPattern?.actionGrips);
    expect(copiedPattern?.measures[0]).not.toBe(originalPattern?.measures[0]);
    expect(copiedPattern?.measures[0].actions[0]).not.toBe(originalPattern?.measures[0].actions[0]);
    expect(copiedPattern?.actionGrips?.[0]).not.toBe(originalPattern?.actionGrips?.[0]);
  });

  it('duplicates parts with copied overlays and reused pattern references', async () => {
    const sheet = createSheet();
    sheet.parts = [{
      id: 'part-1',
      section: 'Verse',
      items: [{
        id: 'item-1',
        patternId: 'pattern-1',
        measureTexts: [{ measureIndex: 0, lyrics: 'hello', notes: 'accent' }],
        actionGrips: [{ measureIndex: 0, actionIndex: 1, gripId: 'grip-c', name: 'C' }]
      }]
    }];
    const { service, getStoredSheet } = createService(sheet);

    const copy = await service.duplicatePart('sheet-1', 0);
    const storedSheet = getStoredSheet();
    const originalPart = storedSheet?.parts[0];
    const copiedPart = storedSheet?.parts[1];

    expect(copy.id).not.toBe('part-1');
    expect(copiedPart?.id).toBe(copy.id);
    expect(copiedPart?.section).toBe('Verse (Copy)');
    expect(copiedPart?.items).toHaveLength(1);
    expect(copiedPart?.items[0].id).not.toBe('item-1');
    expect(copiedPart?.items[0].patternId).toBe('pattern-1');
    expect(copiedPart?.items[0].measureTexts).toEqual(originalPart?.items[0].measureTexts);
    expect(copiedPart?.items[0].actionGrips).toEqual(originalPart?.items[0].actionGrips);
    expect(copiedPart?.items[0].measureTexts[0]).not.toBe(originalPart?.items[0].measureTexts[0]);
    expect(copiedPart?.items[0].actionGrips[0]).not.toBe(originalPart?.items[0].actionGrips[0]);
  });

  it('moves patterns and ignores invalid pattern moves', async () => {
    const sheet = createSheet();
    sheet.patterns.push({
      ...sheet.patterns[0],
      id: 'pattern-2',
      name: 'Chorus Pattern',
      actionGrips: []
    });
    const { service, getStoredSheet, db } = createService(sheet);

    await service.movePattern('sheet-1', 0, 1);

    expect(getStoredSheet()?.patterns.map(pattern => pattern.id)).toEqual(['pattern-2', 'pattern-1']);

    jest.clearAllMocks();
    await service.movePattern('sheet-1', -1, 0);

    expect(db.songSheets.put).not.toHaveBeenCalled();
    expect(getStoredSheet()?.patterns.map(pattern => pattern.id)).toEqual(['pattern-2', 'pattern-1']);
  });

  it('moves parts and ignores invalid part moves', async () => {
    const sheet = createSheet();
    sheet.parts = [
      { id: 'part-1', section: 'Verse', items: [] },
      { id: 'part-2', section: 'Chorus', items: [] }
    ];
    const { service, getStoredSheet, db } = createService(sheet);

    await service.movePart('sheet-1', 0, 1);

    expect(getStoredSheet()?.parts.map(part => part.id)).toEqual(['part-2', 'part-1']);

    jest.clearAllMocks();
    await service.movePart('sheet-1', 0, 2);

    expect(db.songSheets.put).not.toHaveBeenCalled();
    expect(getStoredSheet()?.parts.map(part => part.id)).toEqual(['part-2', 'part-1']);
  });
});
