import { DatabaseService, PATTERNS_INITIALIZED, migratePlayingPatternPickNotes, migrateSongSheetPartsToMeasures, migrateSongSheetToCurrentFormat } from '@/app/core/services/database.service';
import { PlayingPattern } from '@/app/features/patterns/services/playing-patterns.model';
import { SongSheet } from '@/app/features/sheets/services/song-sheets.model';

describe('DatabaseService migrations', () => {
  it('migrates persisted playing patterns to per-note pick modes', () => {
    const pattern = createLegacyPattern([
      {
        technique: 'pick',
        pickMode: 'relative',
        pick: [
          { string: 'bass' },
          { string: 'top', anchor: 'base-note' }
        ]
      },
      {
        technique: 'pick',
        pick: [
          { string: 'middle', anchor: 'grip-note' },
          { string: 2, fret: 4 },
          { fret: 7 }
        ]
      },
      {
        technique: 'strum',
        strum: { direction: 'D', strings: { from: 'middle', to: 'top' } }
      },
      {
        technique: 'hammer-on',
        legatoMode: 'relative',
        legato: {
          string: 'middle',
          target: { anchor: 'grip-note', fretOffset: 2 }
        }
      }
    ]);

    migratePlayingPatternPickNotes(pattern);

    expect(pattern.measures[0].actions).toEqual([
      {
        technique: 'pick',
        pick: [
          { mode: 'relative', string: 'bass', anchor: 'grip-note', fretOffset: 0 },
          { mode: 'relative', string: 'top', anchor: 'base-note' }
        ]
      },
      {
        technique: 'pick',
        pick: [
          { mode: 'relative', string: 'lower-middle', anchor: 'grip-note', fretOffset: 0 },
          { mode: 'explicit', string: 2, fret: 4 },
          { mode: 'explicit', string: 0, fret: 7 }
        ]
      },
      {
        technique: 'strum',
        strum: { direction: 'D', strings: { from: 'lower-middle', to: 'top' } }
      },
      {
        technique: 'hammer-on',
        legatoMode: 'relative',
        legato: {
          string: 'lower-middle',
          target: { anchor: 'grip-note', fretOffset: 2 }
        }
      }
    ]);
  });

  it('migrates song-sheet embedded patterns without clearing data', () => {
    const sheet = {
      patterns: [
        createLegacyPattern([
          {
            technique: 'pick',
            pickMode: 'relative',
            pick: [{ string: 'second-from-bass', anchor: 'grip-note' }]
          }
        ])
      ]
    } as SongSheet;

    sheet.patterns.forEach(pattern => migratePlayingPatternPickNotes(pattern));

    expect(sheet.patterns).toHaveLength(1);
    expect(sheet.patterns[0].measures[0].actions[0]).toEqual({
      technique: 'pick',
      pick: [{ mode: 'relative', string: 'second-from-bass', anchor: 'grip-note', fretOffset: 0 }]
    });
  });

  it('converts legacy parts directly to arrangements and remains idempotent', () => {
    const sheet = {
      id: 'legacy', name: 'Legacy song', tuning: [], capodaster: 0, tempo: 90,
      links: [], grips: [], created: 1, updated: 2,
      patterns: [createLegacyPattern([{ technique: 'slide', legato: { string: '2', toFret: 7 } }])],
      parts: [{ id: 'verse', section: 'Verse', items: [{
        id: 'item', patternId: 'legacy-pattern', actionGrips: [],
        measureTexts: [{ measureIndex: 0, lyrics: 'Keep these words', notes: 'Softly' }]
      }] }]
    };
    migrateSongSheetToCurrentFormat(sheet);
    const migrated = sheet as unknown as SongSheet;
    expect(migrated.parts[0].notes).toBe('Softly');
    expect(migrated.parts[0].lyrics).toBeUndefined();
    expect(migrated.parts[0].measures[0].measure.actions[0]?.legato).toEqual({ string: 2, toFret: 7 });
    expect(migrated.patterns[0].measures[0].actions[0]?.legato).toEqual({ string: 2, toFret: 7 });
    expect(migrated.arrangement).toEqual([{ id: 'occurrence-verse', partId: 'verse', lyrics: 'Keep these words' }]);
    const snapshot = JSON.parse(JSON.stringify(migrated));
    migrateSongSheetToCurrentFormat(migrated);
    expect(migrated).toEqual(snapshot);
  });

  it('migrates legacy song part pattern items to copied measures', () => {
    const pattern = createLegacyPattern([
      { technique: 'strum', strum: { direction: 'D', strings: 'all' } },
      null
    ]);
    pattern.measures.push({
      timeSignature: '3/4',
      actions: Array(12).fill(null)
    });
    pattern.actionGrips = [
      { measureIndex: 0, actionIndex: 0, gripId: 'grip-c', name: 'C' },
      { measureIndex: 0, actionIndex: 1, gripId: 'grip-g', name: 'G' },
      { measureIndex: 1, actionIndex: 2, gripId: 'grip-am', name: 'Am' }
    ];
    const sheet = {
      patterns: [pattern],
      parts: [{
        id: 'part-1',
        section: 'Verse',
        items: [{
          id: 'item-1',
          patternId: pattern.id,
          measureTexts: [
            { measureIndex: 0, lyrics: 'first line', notes: 'push' },
            { measureIndex: 1, lyrics: 'second line', notes: '' }
          ],
          actionGrips: [
            { measureIndex: 0, actionIndex: 0, gripId: 'grip-d', name: 'D' }
          ]
        }]
      }]
    } as any;

    migrateSongSheetPartsToMeasures(sheet);

    expect(sheet.parts[0].items).toBeUndefined();
    expect(sheet.parts[0].lyrics).toBe('first line\nsecond line');
    expect(sheet.parts[0].notes).toBe('push');
    expect(sheet.parts[0].measures).toHaveLength(2);
    expect(sheet.parts[0].measures[0].measure).toMatchObject({
      timeSignature: pattern.measures[0].timeSignature,
      actions: pattern.measures[0].actions
    });
    expect(sheet.parts[0].measures[0].measure).not.toBe(pattern.measures[0]);
    expect(sheet.parts[0].measures[0].measure.actionGrips).toEqual([
      { measureIndex: 0, actionIndex: 0, gripId: 'grip-d', name: 'D' },
      { measureIndex: 0, actionIndex: 1, gripId: 'grip-g', name: 'G' }
    ]);
    expect(sheet.parts[0].measures[1].measure.actionGrips).toEqual([
      { measureIndex: 0, actionIndex: 2, gripId: 'grip-am', name: 'Am' }
    ]);
    expect(sheet.parts[0].measures[0].lyrics).toBeUndefined();
    expect(sheet.parts[0].measures[0].notes).toBeUndefined();
    expect(sheet.parts[0].measures[0].actionGrips).toBeUndefined();
    expect(sheet.parts[0].measures[0].patternId).toBeUndefined();
  });

  it('migrates persisted part-measure action grips into copied measure data', () => {
    const sheet = {
      parts: [{
        id: 'part-1',
        section: 'Verse',
        measures: [{
          id: 'measure-1',
          measure: {
            timeSignature: '4/4',
            actions: Array(16).fill(null),
            actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: 'grip-c', name: 'C' }]
          },
          lyrics: 'old line',
          notes: 'old note',
          actionGrips: [
            { measureIndex: 0, actionIndex: 0, gripId: 'grip-g', name: 'G' },
            { measureIndex: 0, actionIndex: 4, gripId: 'grip-am', name: 'Am' }
          ]
        }]
      }]
    } as any;

    migrateSongSheetPartsToMeasures(sheet);

    expect(sheet.parts[0].measures[0].measure.actionGrips).toEqual([
      { measureIndex: 0, actionIndex: 0, gripId: 'grip-g', name: 'G' },
      { measureIndex: 0, actionIndex: 4, gripId: 'grip-am', name: 'Am' }
    ]);
    expect(sheet.parts[0].lyrics).toBe('old line');
    expect(sheet.parts[0].notes).toBe('old note');
    expect(sheet.parts[0].measures[0].actionGrips).toBeUndefined();
    expect(sheet.parts[0].measures[0].lyrics).toBeUndefined();
    expect(sheet.parts[0].measures[0].notes).toBeUndefined();
  });
});

function createLegacyPattern(actions: unknown[]): PlayingPattern {
  return {
    id: 'legacy-pattern',
    name: 'Legacy Pattern',
    description: '',
    category: '',
    suggestedGenre: '',
    exampleSong: '',
    measures: [{
      timeSignature: '4/4',
      actions: actions as PlayingPattern['measures'][number]['actions']
    }],
    createdAt: 1,
    updatedAt: 1,
    isCustom: true
  };
}

describe('DatabaseService pattern initialization', () => {
  it('seeds a curated campfire-first starter library when the pattern table is empty', async () => {
    const bulkAdd = jest.fn().mockResolvedValue(undefined);
    const db = {
      metadata: { get: jest.fn().mockResolvedValue(undefined), put: jest.fn().mockResolvedValue(undefined) },
      transaction: jest.fn((_mode: string, _tables: unknown, run: () => Promise<void>) => run()),
      playingPatterns: {
        count: jest.fn().mockResolvedValue(0),
        bulkAdd
      }
    };

    await DatabaseService.prototype.initializePatterns.call(db as unknown as DatabaseService);

    expect(bulkAdd).toHaveBeenCalledTimes(1);

    const defaults = bulkAdd.mock.calls[0][0];
    expect(defaults).toHaveLength(16);
    expect(defaults.every((pattern: { isCustom: boolean }) => pattern.isCustom === false)).toBe(true);
    expect(defaults.map((pattern: { name: string }) => pattern.name)).toEqual(expect.arrayContaining([
      'Steady Downstrokes (4/4)',
      'Folk Strum (D-D-U-U-D-U)',
      'Roll Strum (D-DU-UDU)',
      'Country Roads Strum (D-DUD-DU)',
      'Boom-Chick Bass + Brush',
      'Soft Ballad Brush',
      'Bass + Brush Hybrid',
      'Two-Beat Country / Train Beat',
      'Campfire Backbeat Tap',
      'Hammer-On Campfire Drive',
      'Waltz Bass + Brush (3/4)',
      '6/8 Ballad Strum',
      'Chorus Lift Strum',
      'Bass-Treble Arpeggio',
      'Travis Alternating Bass',
      '6/8 Bass + Pinch'
    ]));
    expect(defaults.map((pattern: { name: string }) => pattern.name)).not.toEqual(expect.arrayContaining([
      'Bass + Treble Pinch',
      'Alternating Bass + Pinch',
      'Shuffle Drive 12/8',
      'Muted Funk-Folk Groove',
      'Relative Campfire Bass Walk'
    ]));
    expect(defaults.filter((pattern: { category: string }) => pattern.category === 'Campfire')).toHaveLength(13);
    expect(defaults.filter((pattern: { category: string }) => pattern.category === 'Fingerstyle')).toHaveLength(3);
    expect(defaults.some((pattern: { measures: Array<{ actions: Array<any> }> }) =>
      pattern.measures.some(measure =>
        measure.actions.some(action =>
          action?.pick?.some((note: { mode?: string }) => note.mode === 'relative')
          || (action?.strum?.strings && typeof action.strum.strings === 'object' && 'from' in action.strum.strings)
        )
      )
    )).toBe(true);
    expect(defaults.some((pattern: { category: string; measures: Array<{ actions: Array<any> }> }) =>
      pattern.category === 'Fingerstyle' && pattern.measures.some(measure =>
        measure.actions.some(action => action?.technique === 'pick' && action.pick?.length > 1)
      )
    )).toBe(true);
    expect(defaults.some((pattern: { measures: Array<{ actions: Array<any> }> }) =>
      pattern.measures.some(measure =>
        measure.actions.some(action =>
          action?.technique === 'pull-off'
          || action?.technique === 'slide'
        )
      )
    )).toBe(false);
    expect(defaults.some((pattern: { measures: Array<{ actions: Array<any> }> }) =>
      pattern.measures.some(measure =>
        measure.actions.some(action => action?.technique === 'percussive')
      )
    )).toBe(true);
    expect(defaults.some((pattern: { measures: Array<{ actions: Array<any> }> }) =>
      pattern.measures.some(measure =>
        measure.actions.some(action => action?.technique === 'hammer-on')
      )
    )).toBe(true);
    const defaultIds = defaults.map((pattern: { id: string }) => pattern.id);
    expect(new Set(defaultIds).size).toBe(16);
    expect(defaultIds).toEqual(expect.arrayContaining([
      'default-chorus-lift-strum',
      'default-country-roads-strum-d-dud-du',
      'default-bass-brush-hybrid',
      'default-two-beat-country-train-beat',
      'default-campfire-backbeat-tap',
      'default-hammer-on-campfire-drive',
      'default-bass-pinch-6-8'
    ]));
    expect(defaultIds.every((id: string) => /^default-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))).toBe(true);
    expect(defaultIds.every((id: string) => !/^default-\d+$/.test(id))).toBe(true);
  });

  it('does not reseed defaults when patterns already exist', async () => {
    const bulkAdd = jest.fn().mockResolvedValue(undefined);
    const db = {
      metadata: { get: jest.fn().mockResolvedValue(undefined), put: jest.fn().mockResolvedValue(undefined) },
      transaction: jest.fn((_mode: string, _tables: unknown, run: () => Promise<void>) => run()),
      playingPatterns: {
        count: jest.fn().mockResolvedValue(3),
        bulkAdd
      }
    };

    await DatabaseService.prototype.initializePatterns.call(db as unknown as DatabaseService);

    expect(bulkAdd).not.toHaveBeenCalled();
  });

  it('preserves an intentionally empty initialized library', async () => {
    const db = {
      metadata: { get: jest.fn().mockResolvedValue({ key: PATTERNS_INITIALIZED, value: true }), put: jest.fn() },
      playingPatterns: { count: jest.fn(), bulkAdd: jest.fn() },
      transaction: jest.fn((_mode: string, _tables: unknown, run: () => Promise<void>) => run())
    };
    await DatabaseService.prototype.initializePatterns.call(db as unknown as DatabaseService);
    expect(db.playingPatterns.bulkAdd).not.toHaveBeenCalled();
    expect(db.metadata.put).not.toHaveBeenCalled();
  });
});
