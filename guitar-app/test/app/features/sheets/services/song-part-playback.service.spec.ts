import { SongPartPlaybackService } from '@/app/features/sheets/services/song-part-playback.service';
import { PlaybackPlan, PlaybackService } from '@/app/core/services/playback.service';
import { SongPart, SongSheetWithData } from '@/app/features/sheets/services/song-sheets.model';
import { PlayingPatternPlaybackPlannerService } from '@/app/features/patterns/services/playing-pattern-playback-planner.service';
import { BehaviorSubject } from 'rxjs';
import { HtmlAudioProgress } from '@/app/core/services/html-audio-playback.service';

describe('SongPartPlaybackService', () => {
  const eGripId = 'o|2|2|1|o|o';
  const gGripId = '3|2|o|o|o|3';

  const sheet: SongSheetWithData = {
    id: 'sheet-1',
    name: 'Song',
    tuning: [
      { semitone: 'E', octave: 2 },
      { semitone: 'A', octave: 2 },
      { semitone: 'D', octave: 3 },
      { semitone: 'G', octave: 3 },
      { semitone: 'B', octave: 3 },
      { semitone: 'E', octave: 4 }
    ],
    capodaster: 0,
    tempo: 120,
    links: [],
    grips: [{
      gripId: eGripId,
      name: 'E',
      grip: { strings: ['o', [{ fret: 2 }], [{ fret: 2 }], [{ fret: 1 }], 'o', 'o'] }
    }],
    patterns: [],
    parts: [],
    created: 1,
    updated: 1
  };

  const part: SongPart = {
    id: 'part-1',
    section: 'Verse',
    items: [{
      id: 'item-1',
      patternId: 'pattern-1',
      measureTexts: [],
      actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: eGripId, name: 'E' }]
    }]
  };

  const createPlayback = () => {
    const progress = new BehaviorSubject<HtmlAudioProgress>({
      channel: 'finite:song-part-playback',
      currentTime: 0,
      duration: 1,
      ended: false
    });
    const renderedAudioService = {
      renderInstructions: jest.fn().mockResolvedValue({
        url: 'blob:song-part-playback',
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

    return {
      playback: new PlaybackService(renderedAudioService as any, htmlAudioPlaybackService as any),
      renderedAudioService,
      htmlAudioPlaybackService,
      progress
    };
  };

  const renderedPlan = (renderedAudioService: { renderInstructions: jest.Mock }): PlaybackPlan => ({
    instructions: renderedAudioService.renderInstructions.mock.calls[0][0],
    totalDuration: renderedAudioService.renderInstructions.mock.calls[0][1] - 0.1,
    segmentStartTimes: [],
    totalSegments: 0
  });

  it('toggles a measure preview on and off', async () => {
    const { playback, htmlAudioPlaybackService } = createPlayback();
    const songSheetsService = {
      resolvePartMeasures: jest.fn(() => [{
        itemId: 'item-1',
        itemIndex: 0,
        patternId: 'pattern-1',
        patternName: 'Pattern',
        measureIndex: 0,
        absoluteMeasureIndex: 0,
        measure: {
          timeSignature: '4/4',
          actions: [{
            technique: 'strum',
            strum: { direction: 'D', strings: 'all' },
            modifiers: []
          }, null, null, null]
        },
        lyrics: '',
        notes: '',
        patternActionGrips: [],
        actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: eGripId, name: 'E' }]
      }])
    };
    const service = new SongPartPlaybackService(
      playback,
      songSheetsService as any,
      new PlayingPatternPlaybackPlannerService()
    );

    await service.toggleMeasurePreview(sheet, part, 'item-1', 0);

    expect(service.getSnapshot()).toMatchObject({
      type: 'measure',
      status: 'playing',
      partId: 'part-1',
      itemId: 'item-1',
      itemMeasureIndex: 0
    });

    await service.toggleMeasurePreview(sheet, part, 'item-1', 0);

    expect(htmlAudioPlaybackService.stop).toHaveBeenCalledWith('finite:song-part-playback');
    expect(service.getSnapshot()).toEqual({
      type: 'none',
      status: 'idle'
    });
  });

  it('prefers part action grips over pattern defaults', async () => {
    const { playback, renderedAudioService } = createPlayback();
    const songSheetsService = {
      resolvePartMeasures: jest.fn(() => [{
        itemId: 'item-1',
        itemIndex: 0,
        patternId: 'pattern-1',
        patternName: 'Pattern',
        measureIndex: 0,
        absoluteMeasureIndex: 0,
        measure: {
          timeSignature: '4/4',
          actions: [{
            technique: 'strum',
            strum: { direction: 'D', strings: 'all' },
            modifiers: []
          }, null, null, null]
        },
        lyrics: '',
        notes: '',
        patternActionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: gGripId, name: 'G' }],
        actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: eGripId, name: 'E' }]
      }])
    };
    const service = new SongPartPlaybackService(
      playback,
      songSheetsService as any,
      new PlayingPatternPlaybackPlannerService()
    );

    await service.playSongPart(sheet, part);

    expect(renderedPlan(renderedAudioService).instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        notes: expect.arrayContaining([
          expect.objectContaining({ note: expect.objectContaining({ semitone: 'E', octave: 2 }) })
        ])
      })
    ]));
  });
});
