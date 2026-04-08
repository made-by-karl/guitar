import { PatternPlaybackService } from '@/app/features/patterns/services/pattern-playback.service';
import { PlaybackService } from '@/app/core/services/playback.service';
import { createDefaultPlayingPatterns } from '@/app/features/patterns/services/playing-pattern-defaults';
import { PlayingPattern } from '@/app/features/patterns/services/playing-patterns.model';
import { PlayingPatternPlaybackPlannerService } from '@/app/features/patterns/services/playing-pattern-playback-planner.service';

describe('PatternPlaybackService', () => {
  const eGripId = 'o|2|2|1|o|o';

  const createPattern = (): PlayingPattern => ({
    id: 'pattern-1',
    name: 'Pattern',
    description: '',
    category: '',
    suggestedGenre: '',
    exampleSong: '',
    measures: [{
      timeSignature: '4/4',
      actions: [{
        technique: 'strum',
        strum: { direction: 'D', strings: 'all' },
        modifiers: []
      }, null, null, null]
    }],
    beatGrips: [],
    actionGripOverrides: [],
    createdAt: 1,
    updatedAt: 1
  });

  const createPercussivePattern = (): PlayingPattern => ({
    ...createPattern(),
    id: 'pattern-2',
    measures: [{
      timeSignature: '4/4',
      actions: [{
        technique: 'percussive',
        percussive: { technique: 'body-knock' }
      }, null, null, null]
    }]
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('toggles the active pattern preview on and off', async () => {
    jest.useFakeTimers();
    const midiService = {
      ensureReady: jest.fn().mockResolvedValue(undefined),
      triggerInstruction: jest.fn(),
      playSequence: jest.fn().mockResolvedValue(undefined)
    };
    const service = new PatternPlaybackService(
      new PlaybackService(midiService as any),
      new PlayingPatternPlaybackPlannerService()
    );
    const pattern = createPattern();

    await service.togglePatternPreview(pattern);

    expect(service.getSnapshot()).toMatchObject({
      status: 'playing',
      patternId: 'pattern-1',
      currentMeasureIndex: 0,
      totalMeasures: 1
    });

    await service.togglePatternPreview(pattern);

    expect(service.getSnapshot()).toEqual({ status: 'idle' });
  });

  it('plays scheduled instructions and resets to idle after completion', async () => {
    jest.useFakeTimers();
    const midiService = {
      ensureReady: jest.fn().mockResolvedValue(undefined),
      triggerInstruction: jest.fn(),
      playSequence: jest.fn().mockResolvedValue(undefined)
    };
    const service = new PatternPlaybackService(
      new PlaybackService(midiService as any),
      new PlayingPatternPlaybackPlannerService()
    );

    await service.togglePatternPreview(createPercussivePattern(), undefined, undefined, 120);

    jest.runAllTimers();

    expect(midiService.triggerInstruction).toHaveBeenCalledWith(expect.objectContaining({
      percussion: { technique: 'body-knock' },
      technique: 'percussive'
    }));
    expect(service.getSnapshot()).toEqual({ status: 'idle' });
  });

  it('keeps the preview active until the last strum tail has elapsed', async () => {
    jest.useFakeTimers();
    const midiService = {
      ensureReady: jest.fn().mockResolvedValue(undefined),
      triggerInstruction: jest.fn(),
      playSequence: jest.fn().mockResolvedValue(undefined)
    };
    const service = new PatternPlaybackService(
      new PlaybackService(midiService as any),
      new PlayingPatternPlaybackPlannerService()
    );
    const pattern = createDefaultPlayingPatterns(1).find(value => value.name === 'Percussive Campfire Groove');

    expect(pattern).toBeDefined();

    await service.togglePatternPreview(pattern!, undefined, undefined, 120);

    jest.advanceTimersByTime(2100);
    expect(service.getSnapshot()).toMatchObject({
      status: 'playing',
      patternId: pattern!.id
    });

    jest.advanceTimersByTime(1800);
    expect(service.getSnapshot()).toEqual({ status: 'idle' });
  });

  it('uses pattern-owned beat grips when no explicit grip is passed', async () => {
    jest.useFakeTimers();
    const midiService = {
      ensureReady: jest.fn().mockResolvedValue(undefined),
      triggerInstruction: jest.fn(),
      playSequence: jest.fn().mockResolvedValue(undefined)
    };
    const service = new PatternPlaybackService(
      new PlaybackService(midiService as any),
      new PlayingPatternPlaybackPlannerService()
    );
    const pattern = {
      ...createPattern(),
      beatGrips: [{ measureIndex: 0, beatIndex: 0, gripId: eGripId, chordName: 'E' }]
    };

    await service.togglePatternPreview(pattern, undefined, undefined, 120);
    jest.runAllTimers();

    expect(midiService.triggerInstruction).toHaveBeenCalledWith(expect.objectContaining({
      notes: expect.arrayContaining([
        expect.objectContaining({ note: expect.objectContaining({ semitone: 'E', octave: 2 }) })
      ])
    }));
  });
});
