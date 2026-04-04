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
        { gripId: 'grip-c', chordName: 'C' },
        { gripId: 'grip-g', chordName: 'G' }
      ],
      patterns: [{
        id: 'pattern-1',
        name: 'Verse Pattern',
        description: '',
        category: '',
        measures: [
          { timeSignature: '4/4', actions: Array(16).fill(null) },
          { timeSignature: '3/4', actions: Array(12).fill(null) }
        ],
        beatGrips: [{ measureIndex: 0, beatIndex: 0, gripId: 'grip-g', chordName: 'G' }],
        actionGripOverrides: [{ measureIndex: 1, actionIndex: 2, gripId: 'grip-g', chordName: 'G' }],
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
    expect(item.beatGrips).toEqual([]);
    expect(item.actionGripOverrides).toEqual([]);
  });

  it('normalizes overlays and removes out-of-range beat/action assignments', () => {
    const { service } = createService();
    const pattern = createSheet().patterns[0];
    const item: SongPartPatternItem = {
      id: 'item-1',
      patternId: pattern.id,
      measureTexts: [{ measureIndex: 1, lyrics: 'line', notes: '' }],
      beatGrips: [
        { measureIndex: 0, beatIndex: 3, gripId: 'grip-c', chordName: 'C' },
        { measureIndex: 1, beatIndex: 3, gripId: 'grip-g', chordName: 'G' }
      ],
      actionGripOverrides: [
        { measureIndex: 0, actionIndex: 15, gripId: 'grip-c', chordName: 'C' },
        { measureIndex: 1, actionIndex: 20, gripId: 'grip-g', chordName: 'G' }
      ]
    };

    service.normalizePartItem(item, pattern);

    expect(item.measureTexts).toEqual([
      { measureIndex: 0, lyrics: '', notes: '' },
      { measureIndex: 1, lyrics: 'line', notes: '' }
    ]);
    expect(item.beatGrips).toEqual([
      { measureIndex: 0, beatIndex: 3, gripId: 'grip-c', chordName: 'C' }
    ]);
    expect(item.actionGripOverrides).toEqual([
      { measureIndex: 0, actionIndex: 15, gripId: 'grip-c', chordName: 'C' }
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
      beatGrips: [{ measureIndex: 0, beatIndex: 0, gripId: 'grip-c', chordName: 'C' }],
      actionGripOverrides: [{ measureIndex: 1, actionIndex: 2, gripId: 'grip-g', chordName: 'G' }]
    };

    const resolved = service.resolvePartItem(sheet, item);

    expect(resolved).toHaveLength(2);
    expect(resolved[0].patternName).toBe('Verse Pattern');
    expect(resolved[0].absoluteMeasureIndex).toBe(0);
    expect(resolved[0].lyrics).toBe('hello');
    expect(resolved[0].beatGrips[0].chordName).toBe('C');
    expect(resolved[0].patternBeatGrips[0].chordName).toBe('G');
    expect(resolved[1].absoluteMeasureIndex).toBe(1);
    expect(resolved[1].notes).toBe('hold');
    expect(resolved[1].actionGripOverrides[0].actionIndex).toBe(2);
    expect(resolved[1].patternActionGripOverrides[0].actionIndex).toBe(2);
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
        beatGrips: [{ measureIndex: 0, beatIndex: 0, gripId: 'grip-c', chordName: 'C' }],
        actionGripOverrides: [{ measureIndex: 0, actionIndex: 1, gripId: 'grip-c', chordName: 'C' }]
      }]
    }];

    const { service, getStoredSheet } = createService(sheet);

    await service.removeGrip('sheet-1', 'grip-c');

    expect(getStoredSheet()?.grips).toEqual([{ gripId: 'grip-g', chordName: 'G' }]);
    expect(getStoredSheet()?.parts[0].items[0].beatGrips).toEqual([]);
    expect(getStoredSheet()?.parts[0].items[0].actionGripOverrides).toEqual([]);
  });
});
