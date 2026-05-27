import { PlayingPatternsService } from '@/app/features/patterns/services/playing-patterns.service';
import { createDefaultPlayingPatterns } from '@/app/features/patterns/services/playing-pattern-defaults';
import { isRelativeStrumRange, PlayingAction, RelativeString } from '@/app/features/patterns/services/playing-patterns.model';

describe('PlayingPatternsService', () => {
  it('seeds a curated campfire-first starter library when the pattern table is empty', async () => {
    const bulkAdd = jest.fn().mockResolvedValue(undefined);
    const db = {
      playingPatterns: {
        count: jest.fn().mockResolvedValue(0),
        bulkAdd
      }
    };

    new PlayingPatternsService(db as any);
    await flushPromises();

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
        measure.actions.some(action => action?.pickMode === 'relative' || (action?.strum?.strings && typeof action.strum.strings === 'object' && 'from' in action.strum.strings))
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
      playingPatterns: {
        count: jest.fn().mockResolvedValue(3),
        bulkAdd
      }
    };

    new PlayingPatternsService(db as any);
    await flushPromises();

    expect(bulkAdd).not.toHaveBeenCalled();
  });

  it('creates editable clones with a new custom identity', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1234);
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    const db = {
      playingPatterns: {
        count: jest.fn().mockResolvedValue(1),
        bulkAdd: jest.fn()
      }
    };
    const service = new PlayingPatternsService(db as any);
    await flushPromises();

    const source = createDefaultPlayingPatterns()[0];
    const clone = service.createClone(source);

    expect(clone.id).toMatch(/^custom-1234-/);
    expect(clone.id).not.toBe(source.id);
    expect(clone.name).toBe(`${source.name} Copy`);
    expect(clone.isCustom).toBe(true);
    expect(clone.createdAt).toBe(1234);
    expect(clone.updatedAt).toBe(1234);
    expect(clone.measures).toEqual(source.measures);
    expect(clone.measures).not.toBe(source.measures);

    jest.restoreAllMocks();
  });

  it('restores only missing default patterns', async () => {
    const defaults = createDefaultPlayingPatterns();
    const bulkAdd = jest.fn().mockResolvedValue(undefined);
    const db = {
      playingPatterns: {
        count: jest.fn().mockResolvedValue(1),
        toArray: jest.fn().mockResolvedValue([
          defaults[0],
          {
            id: 'custom-pattern',
            name: 'Custom',
            description: '',
            category: '',
            suggestedGenre: '',
            exampleSong: '',
            measures: [],
            actionGrips: [],
            createdAt: 1,
            updatedAt: 1,
            isCustom: true
          }
        ]),
        bulkAdd
      }
    };
    const service = new PlayingPatternsService(db as any);
    await flushPromises();

    const restoredCount = await service.restoreMissingDefaults();

    expect(restoredCount).toBe(defaults.length - 1);
    expect(bulkAdd).toHaveBeenCalledTimes(1);
    const restoredPatterns = bulkAdd.mock.calls[0][0];
    expect(restoredPatterns).toHaveLength(defaults.length - 1);
    expect(restoredPatterns.map((pattern: { id: string }) => pattern.id)).not.toContain(defaults[0].id);
    expect(restoredPatterns.every((pattern: { isCustom: boolean }) => pattern.isCustom === false)).toBe(true);
  });

  it('does not add defaults when none are missing', async () => {
    const bulkAdd = jest.fn().mockResolvedValue(undefined);
    const db = {
      playingPatterns: {
        count: jest.fn().mockResolvedValue(1),
        toArray: jest.fn().mockResolvedValue(createDefaultPlayingPatterns()),
        bulkAdd
      }
    };
    const service = new PlayingPatternsService(db as any);
    await flushPromises();

    await expect(service.restoreMissingDefaults()).resolves.toBe(0);
    expect(bulkAdd).not.toHaveBeenCalled();
  });

  it('keeps relative upstroke ranges ordered from top toward bass', () => {
    const relativeStringOrder: Record<RelativeString, number> = {
      bass: 0,
      'second-from-bass': 1,
      middle: 2,
      'second-from-top': 3,
      top: 4
    };
    const invalidUpstrokes: string[] = [];

    for (const pattern of createDefaultPlayingPatterns(1)) {
      for (const measure of pattern.measures) {
        for (const action of measure.actions) {
          if (!action || !isRelativeUpstroke(action)) {
            continue;
          }

          if (relativeStringOrder[action.strum!.strings.from] < relativeStringOrder[action.strum!.strings.to]) {
            invalidUpstrokes.push(pattern.name);
          }
        }
      }
    }

    expect(invalidUpstrokes).toEqual([]);
  });
});

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

function isRelativeUpstroke(action: PlayingAction): action is PlayingAction & {
  strum: { direction: 'U'; strings: { from: RelativeString; to: RelativeString } };
} {
  return action.technique === 'strum'
    && action.strum?.direction === 'U'
    && isRelativeStrumRange(action.strum.strings);
}
