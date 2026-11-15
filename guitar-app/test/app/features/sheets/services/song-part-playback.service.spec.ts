import { computed, signal } from '@angular/core';
import { SongPartPlaybackService } from '@/app/features/sheets/services/song-part-playback.service';
import { SongSheetsService } from '@/app/features/sheets/services/song-sheets.service';
import { PlayingAction } from '@/app/features/patterns/services/playing-patterns.model';
import { createPlaybackService } from '@test/helpers/media-playback';
import { SongPart, SongSheetWithData } from '@/app/features/sheets/services/song-sheets.model';
import { PlayingPatternPlaybackPlannerService } from '@/app/features/patterns/services/playing-pattern-playback-planner.service';

describe('SongPartPlaybackService', () => {
  const eGripId = 'o|2|2|1|o|o';

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
    lyrics: '',
    notes: '',
    measures: [{
      id: 'measure-1',
      measure: {
        timeSignature: '4/4',
        actions: Array(4).fill(null),
        actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: eGripId, name: 'E' }]
      }
    }]
  };

  function availabilityService(): SongPartPlaybackService {
    return new SongPartPlaybackService(createPlaybackService({} as never), new SongSheetsService({} as never), new PlayingPatternPlaybackPlannerService());
  }

  it.each<{ action: PlayingAction; playable: boolean }>([
    { action: { technique: 'strum', strum: { direction: 'D', strings: 'all' } }, playable: false },
    { action: { technique: 'percussive', percussive: { technique: 'body-knock' } }, playable: true },
    { action: { technique: 'pick', pick: [{ mode: 'explicit', string: 0, fret: 3 }] }, playable: true }
  ])('checks actual playable events without requiring a grip for $action.technique', ({ action, playable }) => {
    const service = availabilityService();
    const unassigned: SongPart = { ...part, measures: [{ id: 'm', measure: { timeSignature: '4/4', actions: [action] } }] };
    expect(service.canPlaySongPart(sheet, unassigned)).toBe(playable);
    expect(service.canPlayMeasure(sheet, unassigned, 'm')).toBe(playable);
  });

  it('counts inherited grips when checking a measure preview', () => {
    const service = availabilityService();
    const strum: PlayingAction = { technique: 'strum', strum: { direction: 'D', strings: 'all' } };
    const inherited: SongPart = { ...part, measures: [
      { id: 'first', measure: { ...part.measures[0].measure, actions: [null, strum] } },
      { id: 'second', measure: { timeSignature: '4/4', actions: [strum] } }
    ] };
    expect(service.canPlaySongPart(sheet, inherited)).toBe(true);
    expect(service.canPlayMeasure(sheet, inherited, 'second')).toBe(true);
  });

  it('uses occurrence order and inherited string state for repeated parts and full-song playback', async () => {
    jest.useFakeTimers();
    const midi = { ensureReady: jest.fn().mockResolvedValue(undefined), captureInstruction: jest.fn() };
    const service = new SongPartPlaybackService(createPlaybackService(midi as never), new SongSheetsService({} as never), new PlayingPatternPlaybackPlannerService());
    const source: SongPart = { id: 'source', section: 'Intro', notes: '', measures: [{ id: 'source-m', measure: {
      timeSignature: '4/4', actions: [{ technique: 'strum', strum: { direction: 'D', strings: 'all' } }],
      actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: 'x|x|o|2|3|2', name: 'D' }]
    } }] };
    const sliding: SongPart = { id: 'slide', section: 'Verse', notes: '', measures: [{ id: 'slide-m', measure: {
      timeSignature: '4/4', actions: [{ technique: 'slide', slide: { fretOffset: 1 } }]
    } }] };
    const song: SongSheetWithData = { ...sheet, parts: [sliding, source], arrangement: [
      { id: 'intro', partId: source.id, lyrics: '' }, { id: 'verse1', partId: sliding.id, lyrics: 'One' }, { id: 'verse2', partId: sliding.id, lyrics: 'Two' }
    ] };
    try {
      expect(service.canPlaySong(song)).toBe(true);
      expect(service.canPlaySongPart(song, sliding, 'verse2')).toBe(true);
      await service.playSongPart(song, sliding, 'verse2');
      jest.runAllTimers();
      expect(midi.captureInstruction).toHaveBeenCalledTimes(1);
      expect(midi.captureInstruction.mock.calls[0][0].legatos[0]).toMatchObject({ string: 3, source: { note: { semitone: 'A#', octave: 3 } } });
      midi.captureInstruction.mockClear();
      await service.playSong(song);
      expect(service.getSnapshot()).toMatchObject({ type: 'song', occurrenceId: 'intro', totalMeasures: 3 });
      jest.runAllTimers();
      expect(midi.captureInstruction).toHaveBeenCalledTimes(3);
      expect(midi.captureInstruction.mock.calls.map(call => call[0].technique)).toEqual(['normal', 'slide', 'slide']);
      expect(service.canPlaySong({ ...song, arrangement: [...song.arrangement!, { id: 'missing', partId: 'missing', lyrics: '' }] })).toBe(false);
      const rest: SongPart = { id: 'rest', section: 'Break', notes: '', measures: [{ id: 'rest-m', measure: { timeSignature: '4/4', actions: [null, null, null, null] } }] };
      expect(service.canPlaySong({ ...song, parts: [...song.parts, rest], arrangement: [...song.arrangement!, { id: 'break', partId: rest.id, lyrics: '' }] })).toBe(true);
      expect(service.canPlaySong({ ...song, parts: [...song.parts, { ...rest, measures: [] }], arrangement: [...song.arrangement!, { id: 'draft', partId: rest.id, lyrics: '' }] })).toBe(false);
    } finally { service.stopSong(); service.stopSongPart(); }
  });

  it('plays only the chosen measure using the last preceding grip, including changes on rests', async () => {
    jest.useFakeTimers();
    const midi = { ensureReady: jest.fn().mockResolvedValue(undefined), captureInstruction: jest.fn() };
    const service = new SongPartPlaybackService(
      createPlaybackService(midi as never), new SongSheetsService({} as never), new PlayingPatternPlaybackPlannerService()
    );
    const candidate: SongPart = { ...part, measures: [
      { id: 'first', measure: { ...part.measures[0].measure, actions: [null] } },
      { id: 'change', measure: { timeSignature: '4/4', actions: [null, null, null],
        actionGrips: [{ measureIndex: 0, actionIndex: 2, gripId: 'x|x|o|2|3|2', name: 'D' }] } },
      { id: 'rest', measure: { timeSignature: '4/4', actions: [null] } },
      { id: 'target', measure: { timeSignature: '4/4', actions: [
        { technique: 'strum', strum: { direction: 'D', strings: 'all' } }, null, null, null
      ] } },
      { id: 'future', measure: { ...part.measures[0].measure, actions: [null] } }
    ] };
    try {
      expect(service.canPlayMeasure(sheet, candidate, 'target')).toBe(true);
      await service.toggleMeasurePreview(sheet, candidate, 'target');
      jest.runAllTimers();
      expect(midi.captureInstruction).toHaveBeenCalledTimes(1);
      expect(midi.captureInstruction.mock.calls[0][0].notes).toEqual([
        { note: { semitone: 'D', octave: 3 } },
        { note: { semitone: 'A', octave: 3 } },
        { note: { semitone: 'D', octave: 4 } },
        { note: { semitone: 'F#', octave: 4 } }
      ]);
    } finally {
      service.stopMeasurePreview();
    }
  });

  it('inherits sounding D strings for isolated single and group slides in a later measure', async () => {
    jest.useFakeTimers();
    const midi = { ensureReady: jest.fn().mockResolvedValue(undefined), captureInstruction: jest.fn() };
    const service = new SongPartPlaybackService(
      createPlaybackService(midi as never), new SongSheetsService({} as never), new PlayingPatternPlaybackPlannerService()
    );
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const candidate: SongPart = { ...part, measures: [
      { id: 'source', measure: { timeSignature: '4/4', actions: [
        { technique: 'strum', strum: { direction: 'D', strings: 'all' } }
      ], actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: 'x|x|o|2|3|2', name: 'D' }] } },
      { id: 'rest', measure: { timeSignature: '4/4', actions: [null] } },
      { id: 'target', measure: { timeSignature: '4/4', actions: [
        { technique: 'slide', legato: { string: 3, toFret: 4 } }, null,
        { technique: 'slide', slide: { fretOffset: 1 } }, null
      ] } }
    ] };
    try {
      expect(service.canPlayMeasure(sheet, candidate, 'target')).toBe(true);
      await service.toggleMeasurePreview(sheet, candidate, 'target');
      jest.runAllTimers();
      expect(warn).not.toHaveBeenCalled();
      expect(midi.captureInstruction).toHaveBeenCalledTimes(2);
      expect(midi.captureInstruction.mock.calls[0][0]).toMatchObject({
        time: 0, technique: 'slide', legato: { string: 3, source: { note: { semitone: 'A', octave: 3 } } }
      });
      expect(midi.captureInstruction.mock.calls[1][0].legatos).toHaveLength(3);
    } finally {
      service.stopMeasurePreview();
      warn.mockRestore();
    }
  });

  it.each<{ actions: PlayingAction[]; playable: boolean }>([
    { actions: [{ technique: 'slide', legato: { string: 0, toFret: 3 } }], playable: false },
    { actions: [{ technique: 'pull-off', legato: { string: 0, toFret: 0 } }], playable: false },
    { actions: [
      { technique: 'pick', pick: [{ mode: 'explicit', string: 0, fret: 4 }] },
      { technique: 'hammer-on', legato: { string: 0, toFret: 2 } },
      { technique: 'pull-off', legato: { string: 0, toFret: 3 } },
      { technique: 'slide', legato: { string: 0, toFret: 3 } }
    ], playable: true }
  ])('checks availability inside computed without writing to signal-backed console capture: $playable', ({ actions, playable }) => {
    const service = availabilityService();
    const captured = signal<unknown[][]>([]);
    const warn = jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => captured.update(entries => [...entries, args]));
    const candidate: SongPart = { ...part, measures: [{ id: 'm', measure: { timeSignature: '4/4', actions } }] };
    try {
      const canPlayPart = computed(() => service.canPlaySongPart(sheet, candidate));
      const canPlayMeasure = computed(() => service.canPlayMeasure(sheet, candidate, 'm'));
      expect(canPlayPart()).toBe(playable);
      expect(canPlayMeasure()).toBe(playable);
      expect(captured()).toEqual([]);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('reports planning diagnostics when playback is requested', async () => {
    jest.useFakeTimers();
    const service = new SongPartPlaybackService(
      createPlaybackService({ ensureReady: async () => undefined, captureInstruction: jest.fn() } as never),
      new SongSheetsService({} as never), new PlayingPatternPlaybackPlannerService()
    );
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const candidate: SongPart = { ...part, measures: [{ id: 'm', measure: { timeSignature: '4/4', actions: [
      { technique: 'pick', pick: [{ mode: 'explicit', string: 0, fret: 4 }] },
      { technique: 'hammer-on', legato: { string: 0, toFret: 2 } }
    ] } }] };
    try {
      expect(service.canPlaySongPart(sheet, candidate)).toBe(true);
      expect(warn).not.toHaveBeenCalled();
      await service.playSongPart(sheet, candidate);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('hammer-on warning'));
    } finally {
      service.stopSongPart();
      warn.mockRestore();
    }
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('toggles a measure preview on and off', async () => {
    jest.useFakeTimers();
    const midiService = {
      ensureReady: jest.fn().mockResolvedValue(undefined),
      captureInstruction: jest.fn(),
      playSequence: jest.fn().mockResolvedValue(undefined)
    };
    const songSheetsService = {
      resolvePartMeasures: jest.fn(() => [{
        measureId: 'measure-1',
        measureIndex: 0,
        measure: {
          timeSignature: '4/4',
          actions: [{
            technique: 'strum',
            strum: { direction: 'D', strings: 'all' },
            modifiers: []
          }, null, null, null],
          actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: eGripId, name: 'E' }]
        }
      }])
    };
    const service = new SongPartPlaybackService(
      createPlaybackService(midiService as any),
      songSheetsService as any,
      new PlayingPatternPlaybackPlannerService()
    );

    await service.toggleMeasurePreview(sheet, part, 'measure-1');

    expect(service.getSnapshot()).toMatchObject({
      type: 'measure',
      status: 'playing',
      partId: 'part-1',
      measureId: 'measure-1'
    });

    await service.toggleMeasurePreview(sheet, part, 'measure-1');

    expect(service.getSnapshot()).toEqual({
      type: 'none',
      status: 'idle'
    });
  });

  it('plays resolved part measure grips', async () => {
    jest.useFakeTimers();
    const midiService = {
      ensureReady: jest.fn().mockResolvedValue(undefined),
      captureInstruction: jest.fn(),
      playSequence: jest.fn().mockResolvedValue(undefined)
    };
    const songSheetsService = {
      resolvePartMeasures: jest.fn(() => [{
        measureId: 'measure-1',
        measureIndex: 0,
        measure: {
          timeSignature: '4/4',
          actions: [{
            technique: 'strum',
            strum: { direction: 'D', strings: 'all' },
            modifiers: []
          }, null, null, null],
          actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: eGripId, name: 'E' }]
        }
      }])
    };
    const service = new SongPartPlaybackService(
      createPlaybackService(midiService as any),
      songSheetsService as any,
      new PlayingPatternPlaybackPlannerService()
    );

    await service.playSongPart(sheet, part);
    jest.runAllTimers();

    expect(midiService.captureInstruction).toHaveBeenCalledWith(expect.objectContaining({
      notes: expect.arrayContaining([
        expect.objectContaining({ note: expect.objectContaining({ semitone: 'E', octave: 2 }) })
      ])
    }));
  });
});
