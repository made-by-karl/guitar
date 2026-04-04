import { SongPartPlaybackService } from '@/app/features/sheets/services/song-part-playback.service';
import { PlaybackService } from '@/app/core/services/playback.service';
import { SongPart, SongSheetWithData } from '@/app/features/sheets/services/song-sheets.model';
import { RhythmPatternPlaybackPlannerService } from '@/app/features/patterns/services/rhythm-pattern-playback-planner.service';

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
    grips: [{
      gripId: eGripId,
      chordName: 'E',
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
      beatGrips: [{ measureIndex: 0, beatIndex: 0, gripId: eGripId, chordName: 'E' }],
      actionGripOverrides: []
    }]
  };

  afterEach(() => {
    jest.useRealTimers();
  });

  it('toggles a measure preview on and off', async () => {
    jest.useFakeTimers();
    const midiService = {
      ensureReady: jest.fn().mockResolvedValue(undefined),
      triggerInstruction: jest.fn(),
      playSequence: jest.fn().mockResolvedValue(undefined)
    };
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
        patternBeatGrips: [],
        patternActionGripOverrides: [],
        beatGrips: [{ measureIndex: 0, beatIndex: 0, gripId: eGripId, chordName: 'E' }],
        actionGripOverrides: []
      }])
    };
    const service = new SongPartPlaybackService(
      new PlaybackService(midiService as any),
      songSheetsService as any,
      new RhythmPatternPlaybackPlannerService()
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

    expect(service.getSnapshot()).toEqual({
      type: 'none',
      status: 'idle'
    });
  });

  it('prefers part grip overrides over pattern defaults', async () => {
    jest.useFakeTimers();
    const midiService = {
      ensureReady: jest.fn().mockResolvedValue(undefined),
      triggerInstruction: jest.fn(),
      playSequence: jest.fn().mockResolvedValue(undefined)
    };
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
        patternBeatGrips: [{ measureIndex: 0, beatIndex: 0, gripId: gGripId, chordName: 'G' }],
        patternActionGripOverrides: [],
        beatGrips: [{ measureIndex: 0, beatIndex: 0, gripId: eGripId, chordName: 'E' }],
        actionGripOverrides: []
      }])
    };
    const service = new SongPartPlaybackService(
      new PlaybackService(midiService as any),
      songSheetsService as any,
      new RhythmPatternPlaybackPlannerService()
    );

    await service.playSongPart(sheet, part);
    jest.runAllTimers();

    expect(midiService.triggerInstruction).toHaveBeenCalledWith(expect.objectContaining({
      notes: expect.arrayContaining([
        expect.objectContaining({ note: expect.objectContaining({ semitone: 'E', octave: 2 }) })
      ])
    }));
  });
});
