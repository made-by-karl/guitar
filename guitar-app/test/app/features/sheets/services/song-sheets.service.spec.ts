import { SongSheetsService } from '@/app/features/sheets/services/song-sheets.service';
import { SongSheet } from '@/app/features/sheets/services/song-sheets.model';

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
      links: [],
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

  it('creates sheets with an empty external links list', async () => {
    const { service } = createService();

    const sheet = await service.create('New Song');

    expect(sheet.links).toEqual([]);
  });

  it('starts with an empty part, repeats music without copying it, and keeps lyrics independent', async () => {
    const { service, getStoredSheet } = createService(createSheet());
    const first = await service.addOccurrence('sheet-1');
    const source = getStoredSheet()!.parts[0];
    expect(source.measures).toHaveLength(0);
    await service.saveOccurrence('sheet-1', first.id, 'First words', { ...source, section: 'Verse' });
    const second = await service.addOccurrence('sheet-1', first.partId, first.id);
    expect(getStoredSheet()!.parts).toHaveLength(1);
    expect(second.lyrics).toBe('');
    await service.saveOccurrence('sheet-1', second.id, 'Second words', { ...source, section: 'Verse', notes: 'Once for both' });
    expect(getStoredSheet()!.arrangement?.map(item => item.lyrics)).toEqual(['First words', 'Second words']);
    expect(getStoredSheet()!.parts[0].notes).toBe('Once for both');
    await service.moveOccurrence('sheet-1', 1, 0);
    expect(getStoredSheet()!.arrangement?.map(item => item.lyrics)).toEqual(['Second words', 'First words']);
    await service.removeOccurrence('sheet-1', first.id);
    expect(getStoredSheet()!.arrangement?.map(item => item.id)).toEqual([second.id]);
    expect(getStoredSheet()!.parts).toHaveLength(1);
  });

  it('makes one occurrence independent without losing lyrics or changing the source', async () => {
    const { service, getStoredSheet } = createService(createSheet());
    const first = await service.addOccurrence('sheet-1');
    const second = await service.addOccurrence('sheet-1', first.partId);
    const source = getStoredSheet()!.parts[0];
    source.measures = [service.createEmptyPartMeasure()];
    await service.saveOccurrence('sheet-1', second.id, 'Different lyrics', {
      ...source, id: 'variation', section: 'Verse 2', notes: 'New notes',
      measures: [{ ...source.measures[0], id: 'variation-measure' }]
    });
    expect(getStoredSheet()!.arrangement?.[0].partId).toBe(source.id);
    expect(getStoredSheet()!.arrangement?.[1]).toMatchObject({ partId: 'variation', lyrics: 'Different lyrics' });
    expect(getStoredSheet()!.parts[0].notes).toBe('');
    expect(getStoredSheet()!.parts[1]).toMatchObject({ section: 'Verse 2', notes: 'New notes' });
    await service.removePart('sheet-1', 1);
    expect(getStoredSheet()!.arrangement?.map(item => item.id)).toEqual([first.id]);
  });

  it('copies measures from sheet-local patterns without storing pattern references', () => {
    const { service } = createService();
    const sheet = createSheet();

    const measures = service.createMeasuresFromPattern(sheet.patterns[0]);

    expect(measures).toHaveLength(2);
    expect((measures[0] as any).lyrics).toBeUndefined();
    expect((measures[0] as any).notes).toBeUndefined();
    expect(measures[0].measure.actionGrips).toEqual([]);
    expect(measures[1].measure.actionGrips).toEqual([
      { measureIndex: 0, actionIndex: 2, gripId: 'grip-g', name: 'G' }
    ]);
    expect((measures[0] as any).patternId).toBeUndefined();
    expect(measures[0].measure).toMatchObject({
      timeSignature: sheet.patterns[0].measures[0].timeSignature,
      actions: sheet.patterns[0].measures[0].actions
    });
    expect(measures[0].measure).not.toBe(sheet.patterns[0].measures[0]);
  });

  it('creates empty measures using the requested time signature', () => {
    const { service } = createService();

    const measure = service.createEmptyPartMeasure('3/4');

    expect(measure.measure.timeSignature).toBe('3/4');
    expect(measure.measure.actions).toHaveLength(12);
    expect((measure as any).lyrics).toBeUndefined();
    expect((measure as any).notes).toBeUndefined();
  });

  it('resolves part measures directly from copied part data', () => {
    const { service } = createService();
    const sheet = createSheet();
    const part = {
      id: 'part-1',
      section: 'Verse',
      lyrics: 'hello',
      notes: 'accent',
      measures: [{
        id: 'measure-1',
        measure: {
          ...sheet.patterns[0].measures[0],
          actionGrips: [{ measureIndex: 0, actionIndex: 2, gripId: 'grip-g', name: 'G' }]
        }
      }]
    };

    const resolved = service.resolvePartMeasures(sheet, part);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].measureId).toBe('measure-1');
    expect((resolved[0] as any).lyrics).toBeUndefined();
    expect((resolved[0] as any).notes).toBeUndefined();
    expect(resolved[0].measure.actionGrips?.[0].actionIndex).toBe(2);
    expect((resolved[0] as any).patternName).toBeUndefined();
    expect((resolved[0] as any).absoluteMeasureIndex).toBeUndefined();
  });

  it('removes grip references from all part measures when a grip is deleted', async () => {
    const sheet = createSheet();
    sheet.parts = [{
      id: 'part-1',
      section: 'Verse',
      lyrics: '',
      notes: '',
      measures: [{
        id: 'measure-1',
        measure: {
          ...sheet.patterns[0].measures[0],
          actionGrips: [{ measureIndex: 0, actionIndex: 1, gripId: 'grip-c', name: 'C' }]
        }
      }]
    }];

    const { service, getStoredSheet } = createService(sheet);

    await service.removeGrip('sheet-1', 'grip-c');

    expect(getStoredSheet()?.grips).toEqual([{ gripId: 'grip-g', name: 'G' }]);
    expect(getStoredSheet()?.parts[0].measures[0].measure.actionGrips).toEqual([]);
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

  it('duplicates parts with independent copied measures', async () => {
    const sheet = createSheet();
    sheet.parts = [{
      id: 'part-1',
      section: 'Verse',
      lyrics: 'hello',
      notes: 'accent',
      measures: [{
        id: 'measure-1',
        measure: {
          ...sheet.patterns[0].measures[0],
          actionGrips: [{ measureIndex: 0, actionIndex: 1, gripId: 'grip-c', name: 'C' }]
        }
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
    expect(copiedPart?.lyrics).toBe(originalPart?.lyrics);
    expect(copiedPart?.notes).toBe(originalPart?.notes);
    expect(copiedPart?.measures).toHaveLength(1);
    expect(copiedPart?.measures[0].id).not.toBe('measure-1');
    expect(copiedPart?.measures[0].measure.actionGrips).toEqual(originalPart?.measures[0].measure.actionGrips);
    expect(copiedPart?.measures[0].measure).toEqual(originalPart?.measures[0].measure);
    expect(copiedPart?.measures[0].measure).not.toBe(originalPart?.measures[0].measure);
    expect(copiedPart?.measures[0].measure.actionGrips?.[0]).not.toBe(originalPart?.measures[0].measure.actionGrips?.[0]);
  });

  it('removes patterns after they have been imported into a part', async () => {
    const sheet = createSheet();
    sheet.parts = [{
      id: 'part-1',
      section: 'Verse',
      lyrics: '',
      notes: '',
      measures: [{
        id: 'measure-1',
        measure: {
          ...sheet.patterns[0].measures[0],
          actionGrips: []
        }
      }]
    }];
    const { service, getStoredSheet } = createService(sheet);

    await service.removePattern('sheet-1', 'pattern-1');

    expect(getStoredSheet()?.patterns).toEqual([]);
    expect(getStoredSheet()?.parts[0].measures).toHaveLength(1);
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
      { id: 'part-1', section: 'Verse', lyrics: '', notes: '', measures: [] },
      { id: 'part-2', section: 'Chorus', lyrics: '', notes: '', measures: [] }
    ];
    const { service, getStoredSheet, db } = createService(sheet);

    await service.movePart('sheet-1', 0, 1);

    expect(getStoredSheet()?.parts.map(part => part.id)).toEqual(['part-2', 'part-1']);

    jest.clearAllMocks();
    await service.movePart('sheet-1', 0, 2);

    expect(db.songSheets.put).not.toHaveBeenCalled();
    expect(getStoredSheet()?.parts.map(part => part.id)).toEqual(['part-2', 'part-1']);
  });

  it('stores normalized external link objects when updating a sheet', async () => {
    const sheet = createSheet();
    const { service, getStoredSheet } = createService(sheet);

    await service.update({
      ...sheet,
      links: [{
        id: 'link-1',
        url: 'https://example.com/tutorial',
        description: 'Video walkthrough',
        transient: true
      } as any]
    });

    expect(getStoredSheet()?.links).toEqual([{
      id: 'link-1',
      url: 'https://example.com/tutorial',
      description: 'Video walkthrough'
    }]);
    expect((getStoredSheet()?.links[0] as any).transient).toBeUndefined();
  });
});
