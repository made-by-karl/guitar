import { PlayingPatternsService } from '@/app/features/patterns/services/playing-patterns.service';
import { createDefaultPlayingPatterns } from '@/app/features/patterns/services/playing-pattern-defaults';
import { isRelativeStrumRange, PlayingAction, RelativeString } from '@/app/features/patterns/services/playing-patterns.model';

describe('PlayingPatternsService', () => {
  it('initializes through the database before loading the library', async () => {
    let finish!: () => void;
    const initializePatterns = jest.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const toArray = jest.fn().mockResolvedValue([]);
    const service = new PlayingPatternsService({ initializePatterns, playingPatterns: { toArray } } as any);
    const loading = service.getAll();
    expect(toArray).not.toHaveBeenCalled();
    finish();
    await expect(loading).resolves.toEqual([]);
    expect(initializePatterns).toHaveBeenCalledTimes(1);
    expect(toArray).toHaveBeenCalledTimes(1);
  });

  it('creates editable clones with a new custom identity', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1234);
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    const db = {
      initializePatterns: jest.fn().mockResolvedValue(undefined),
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
      initializePatterns: jest.fn().mockResolvedValue(undefined),
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
      initializePatterns: jest.fn().mockResolvedValue(undefined),
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
      'lower-middle': 2,
      'upper-middle': 3,
      'second-from-top': 4,
      top: 5
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
