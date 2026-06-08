import { BehaviorSubject } from 'rxjs';
import { PatternPlaybackService } from '@/app/features/patterns/services/pattern-playback.service';
import { PlaybackPlan, PlaybackService } from '@/app/core/services/playback.service';
import { createDefaultPlayingPatterns } from '@/app/features/patterns/services/playing-pattern-defaults';
import { PlayingPattern } from '@/app/features/patterns/services/playing-patterns.model';
import { PlayingPatternPlaybackPlannerService } from '@/app/features/patterns/services/playing-pattern-playback-planner.service';
import { HtmlAudioProgress } from '@/app/core/services/html-audio-playback.service';

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
    actionGrips: [],
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

  const createService = () => {
    const progress = new BehaviorSubject<HtmlAudioProgress>({
      channel: 'finite:pattern-preview',
      currentTime: 0,
      duration: 1,
      ended: false
    });
    const renderedAudioService = {
      renderInstructions: jest.fn().mockResolvedValue({
        url: 'blob:pattern-preview',
        blob: new Blob(['wav'], { type: 'audio/wav' }),
        durationSeconds: 1
      })
    };
    const htmlAudioPlaybackService = {
      play: jest.fn().mockResolvedValue(undefined),
      pause: jest.fn(),
      resume: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
      seek: jest.fn(),
      progress$: jest.fn(() => progress.asObservable())
    };
    const service = new PatternPlaybackService(
      new PlaybackService(renderedAudioService as any, htmlAudioPlaybackService as any),
      new PlayingPatternPlaybackPlannerService()
    );

    return { service, renderedAudioService, htmlAudioPlaybackService, progress };
  };

  const renderedPlan = (renderedAudioService: { renderInstructions: jest.Mock }): PlaybackPlan => ({
    instructions: renderedAudioService.renderInstructions.mock.calls[0][0],
    totalDuration: renderedAudioService.renderInstructions.mock.calls[0][1] - 0.1,
    segmentStartTimes: [],
    totalSegments: 0
  });

  it('toggles the active pattern preview on and off', async () => {
    const { service, htmlAudioPlaybackService } = createService();
    const pattern = createPattern();

    await service.togglePatternPreview(pattern);

    expect(service.getSnapshot()).toMatchObject({
      status: 'playing',
      patternId: 'pattern-1',
      currentMeasureIndex: 0,
      totalMeasures: 2
    });

    await service.togglePatternPreview(pattern);

    expect(htmlAudioPlaybackService.stop).toHaveBeenCalledWith('finite:pattern-preview');
    expect(service.getSnapshot()).toEqual({ status: 'idle' });
  });

  it('renders percussion instructions and resets to idle after media completion', async () => {
    const { service, renderedAudioService, progress } = createService();

    await service.togglePatternPreview(createPercussivePattern(), undefined, undefined, 120);

    expect(renderedPlan(renderedAudioService).instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        percussion: { technique: 'body-knock' },
        technique: 'percussive'
      })
    ]));

    progress.next({
      channel: 'finite:pattern-preview',
      currentTime: 10,
      duration: 10,
      ended: true
    });

    expect(service.getSnapshot()).toEqual({ status: 'idle' });
  });

  it('previews one-measure patterns twice with E then A grips', async () => {
    const { service, renderedAudioService } = createService();

    await service.togglePatternPreview(createPattern(), undefined, undefined, 120);

    expect(service.getSnapshot()).toMatchObject({
      status: 'playing',
      patternId: 'pattern-1',
      totalMeasures: 2
    });
    expect(renderedPlan(renderedAudioService).instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        notes: expect.arrayContaining([
          expect.objectContaining({ note: expect.objectContaining({ semitone: 'G#', octave: 3 }) })
        ])
      }),
      expect.objectContaining({
        notes: expect.arrayContaining([
          expect.objectContaining({ note: expect.objectContaining({ semitone: 'C#', octave: 4 }) })
        ])
      })
    ]));
  });

  it('previews two-measure patterns twice', async () => {
    const { service } = createService();
    const pattern = createPattern();
    pattern.measures = [pattern.measures[0], pattern.measures[0]];

    await service.togglePatternPreview(pattern, undefined, undefined, 120);

    expect(service.getSnapshot()).toMatchObject({
      status: 'playing',
      patternId: 'pattern-1',
      totalMeasures: 4
    });
  });

  it('previews patterns longer than two measures twice with E then A grips', async () => {
    const { service, renderedAudioService } = createService();
    const pattern = createPattern();
    pattern.measures = [pattern.measures[0], pattern.measures[0], pattern.measures[0]];

    await service.togglePatternPreview(pattern, undefined, undefined, 120);

    expect(service.getSnapshot()).toMatchObject({
      status: 'playing',
      patternId: 'pattern-1',
      totalMeasures: 6
    });
    expect(renderedPlan(renderedAudioService).instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        notes: expect.arrayContaining([
          expect.objectContaining({ note: expect.objectContaining({ semitone: 'G#', octave: 3 }) })
        ])
      }),
      expect.objectContaining({
        notes: expect.arrayContaining([
          expect.objectContaining({ note: expect.objectContaining({ semitone: 'C#', octave: 4 }) })
        ])
      })
    ]));
  });

  it('keeps the preview active until media progress reaches the plan duration', async () => {
    const { service, progress } = createService();
    const pattern = createDefaultPlayingPatterns(1).find(value => value.name === 'Chorus Lift Strum');

    expect(pattern).toBeDefined();

    await service.togglePatternPreview(pattern!, undefined, undefined, 120);

    progress.next({
      channel: 'finite:pattern-preview',
      currentTime: 4.1,
      duration: 6,
      ended: false
    });
    expect(service.getSnapshot()).toMatchObject({
      status: 'playing',
      patternId: pattern!.id
    });

    progress.next({
      channel: 'finite:pattern-preview',
      currentTime: 6.1,
      duration: 6.1,
      ended: false
    });
    expect(service.getSnapshot()).toEqual({ status: 'idle' });
  });

  it('uses pattern-owned action grips when no explicit grip is passed', async () => {
    const { service, renderedAudioService } = createService();
    const pattern = {
      ...createPattern(),
      actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: eGripId, name: 'E' }]
    };

    await service.togglePatternPreview(pattern, undefined, undefined, 120);

    expect(renderedPlan(renderedAudioService).instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        notes: expect.arrayContaining([
          expect.objectContaining({ note: expect.objectContaining({ semitone: 'E', octave: 2 }) })
        ])
      })
    ]));
  });
});
