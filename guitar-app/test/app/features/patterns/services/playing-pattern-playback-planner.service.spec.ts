import { note } from '@/app/core/music/semitones';
import { createDefaultPlayingPatterns } from '@/app/features/patterns/services/playing-pattern-defaults';
import { PlayingPatternPlaybackPlannerService } from '@/app/features/patterns/services/playing-pattern-playback-planner.service';

describe('PlayingPatternPlaybackPlannerService', () => {
  it('slides sounding fretted strings together while leaving open strings unchanged', () => {
    const planner = new PlayingPatternPlaybackPlannerService();
    const plan = planner.buildPlaybackPlan([{ measure: { timeSignature: '4/4', actions: [
      { technique: 'pick', pick: [
        { mode: 'explicit', string: 0, fret: 0 },
        { mode: 'explicit', string: 1, fret: 3 },
        { mode: 'explicit', string: 2, fret: 2 }
      ] },
      { technique: 'slide', slide: { fretOffset: 2 } },
      { technique: 'slide', slide: { fretOffset: -1 } }
    ] } }], [
      { semitone: 'E', octave: 2 }, { semitone: 'A', octave: 2 }, { semitone: 'D', octave: 3 }
    ], 120);
    const slides = plan.instructions.filter(instruction => instruction.technique === 'slide').sort((a, b) => a.time - b.time);
    expect(slides[0].legatos?.map(legato => legato.string)).toEqual([1, 2]);
    expect(slides[0].legatos?.map(legato => legato.target.note.semitone)).toEqual(['D', 'F#']);
    expect(slides[1].legatos?.map(legato => legato.source?.note.semitone)).toEqual(['D', 'F#']);
    expect(slides[1].legatos?.map(legato => legato.target.note.semitone)).toEqual(['C#', 'F']);
  });

  it('does not invent notes for an orphan group slide or shift only part of an invalid shape', () => {
    const planner = new PlayingPatternPlaybackPlannerService();
    const plan = planner.buildPlaybackPlan([{ measure: { timeSignature: '4/4', actions: [
      { technique: 'slide', slide: { fretOffset: 2 } },
      { technique: 'pick', pick: [{ mode: 'explicit', string: 0, fret: 1 }, { mode: 'explicit', string: 1, fret: 5 }] },
      { technique: 'slide', slide: { fretOffset: -2 } }
    ] } }], [{ semitone: 'E', octave: 2 }, { semitone: 'A', octave: 2 }], 120);
    expect(plan.instructions.filter(instruction => instruction.technique === 'slide')).toHaveLength(0);
  });

  const tuning = [
    note('E', 2),
    note('A', 2),
    note('D', 3),
    note('G', 3),
    note('B', 3),
    note('E', 4)
  ];

  const grip = {
    strings: ['o', [{ fret: 2 }], [{ fret: 2 }], [{ fret: 1 }], 'o', 'o']
  };
  const barreGrip = {
    strings: ['x', [{ fret: 5, isPartOfBarre: true }], [{ fret: 7 }], [{ fret: 7 }], [{ fret: 7 }], [{ fret: 5, isPartOfBarre: true }]]
  };

  it('replays preceding measures for single and group slide sources without scheduling earlier notes or diagnostics', () => {
    const service = new PlayingPatternPlaybackPlannerService();
    const plan = service.buildPlaybackPlan([{ measure: { timeSignature: '4/4', actions: [
      { technique: 'slide', legato: { string: 3, toFret: 4 } },
      { technique: 'slide', slide: { fretOffset: 1 } }
    ] } }], tuning, 120, undefined, [{
      measure: { timeSignature: '4/4', actions: [
        { technique: 'slide', legato: { string: 0, toFret: 1 } },
        { technique: 'strum', strum: { direction: 'D', strings: 'all' } },
        { technique: 'slide', legato: { string: 5, toFret: 4 } }
      ] },
      actionGrips: [{ measureIndex: 0, actionIndex: 1, gripId: 'x|x|o|2|3|2', name: 'D' }]
    }, {
      measure: { timeSignature: '4/4', actions: [null] },
      actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: 'o|2|2|1|o|o', name: 'E' }]
    }]);
    expect(plan.diagnostics).toEqual([]);
    expect(plan.instructions).toHaveLength(2);
    expect(plan.instructions.map(instruction => instruction.time)).toEqual([0, 0.125]);
    expect(plan.segmentStartTimes).toEqual([0]);
    expect(plan.totalSegments).toBe(1);
    expect(plan.instructions[0].legato).toMatchObject({
      string: 3, source: { note: note('A', 3) }, target: { note: note('B', 3) }
    });
    expect(plan.instructions[1].legatos).toEqual([
      { string: 3, source: { note: note('B', 3) }, target: { note: note('C', 4) } },
      { string: 4, source: { note: note('D', 4) }, target: { note: note('D#', 4) } },
      { string: 5, source: { note: note('G#', 4) }, target: { note: note('A', 4) } }
    ]);
  });

  it('preserves string muting in earlier measures instead of inventing a slide source from the grip', () => {
    const service = new PlayingPatternPlaybackPlannerService();
    const plan = service.buildPlaybackPlan([{ measure: { timeSignature: '4/4', actions: [
      { technique: 'slide', legato: { string: 3, toFret: 4 } },
      { technique: 'slide', slide: { fretOffset: 1 } }
    ] } }], tuning, 120, undefined, [{
      measure: { timeSignature: '4/4', actions: [
        { technique: 'strum', strum: { direction: 'D', strings: 'all' } },
        { technique: 'pick', pick: [{ mode: 'explicit', string: 3, fret: -1 }] }
      ] },
      actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: 'x|x|o|2|3|2', name: 'D' }]
    }]);
    expect(plan.diagnostics).toEqual(['slide skipped: no previous note is sounding on string 4']);
    expect(plan.instructions).toHaveLength(1);
    expect(plan.instructions[0].legatos?.map(legato => legato.string)).toEqual([4, 5]);
  });

  it('resolves hammer-on source from a previous picked note on the same string', () => {
    const service = new PlayingPatternPlaybackPlannerService();

    const plan = service.buildPlaybackPlan([{
      measure: {
        timeSignature: '4/4',
        actions: [{
          technique: 'pick',
          pick: [{ mode: 'explicit', string: 1, fret: 2 }]
        }, {
          technique: 'hammer-on',
          legato: { string: 1, toFret: 4 }
        }, null, null]
      }
    }], tuning, 120, grip as any);

    expect(plan.instructions).toHaveLength(2);
    expect(plan.instructions[1]).toMatchObject({
      technique: 'hammer-on',
      playbackDuration: 0.25,
      actionDuration: 0.125,
      legato: {
        string: 1,
        source: { note: { semitone: 'B', octave: 2 } },
        target: { note: { semitone: 'C#', octave: 3 } }
      },
      notes: [
        { note: { semitone: 'C#', octave: 3 } }
      ]
    });
  });

  it('resolves pull-off source from a previous picked note on the same string', () => {
    const service = new PlayingPatternPlaybackPlannerService();

    const plan = service.buildPlaybackPlan([{
      measure: {
        timeSignature: '4/4',
        actions: [{
          technique: 'pick',
          pick: [{ mode: 'explicit', string: 2, fret: 4 }]
        }, {
          technique: 'pull-off',
          legato: { string: 2, toFret: 2 }
        }, null, null]
      }
    }], tuning, 120, grip as any);

    expect(plan.instructions[1]).toMatchObject({
      technique: 'pull-off',
      playbackDuration: 0.25,
      actionDuration: 0.125,
      legato: {
        string: 2,
        source: { note: { semitone: 'F#', octave: 3 } },
        target: { note: { semitone: 'E', octave: 3 } }
      }
    });
  });

  it('keeps hammer-ons at an eighth when the following slot uses a different string', () => {
    const service = new PlayingPatternPlaybackPlannerService();

    const plan = service.buildPlaybackPlan([{
      measure: {
        timeSignature: '4/4',
        actions: [{
          technique: 'pick',
          pick: [{ mode: 'explicit', string: 1, fret: 2 }]
        }, {
          technique: 'hammer-on',
          legato: { string: 1, toFret: 4 }
        }, {
          technique: 'pick',
          pick: [{ mode: 'explicit', string: 5, fret: 0 }]
        }, null]
      }
    }], tuning, 120, grip as any);

    expect(plan.instructions[1]).toMatchObject({
      technique: 'hammer-on',
      playbackDuration: 0.25,
      actionDuration: 0.125
    });
  });

  it('cuts pull-offs short when the same string is played in the following slot', () => {
    const service = new PlayingPatternPlaybackPlannerService();

    const plan = service.buildPlaybackPlan([{
      measure: {
        timeSignature: '4/4',
        actions: [{
          technique: 'pick',
          pick: [{ mode: 'explicit', string: 2, fret: 4 }]
        }, {
          technique: 'pull-off',
          legato: { string: 2, toFret: 2 }
        }, {
          technique: 'pick',
          pick: [{ mode: 'explicit', string: 2, fret: 0 }]
        }, null]
      }
    }], tuning, 120, grip as any);

    expect(plan.instructions[1]).toMatchObject({
      technique: 'pull-off',
      playbackDuration: 0.125,
      actionDuration: 0.125
    });
  });

  it('builds slide instructions on the selected string', () => {
    const service = new PlayingPatternPlaybackPlannerService();

    const plan = service.buildPlaybackPlan([{
      measure: {
        timeSignature: '4/4',
        actions: [{
          technique: 'pick',
          pick: [{ mode: 'explicit', string: 0, fret: 3 }]
        }, {
          technique: 'slide',
          legato: { string: 0, toFret: 5 }
        }, null, null]
      }
    }], tuning, 120, grip as any);

    expect(plan.instructions[1]).toMatchObject({
      technique: 'slide',
      legato: {
        string: 0,
        source: { note: { semitone: 'G', octave: 2 } },
        target: { note: { semitone: 'A', octave: 2 } }
      }
    });
  });

  it('resolves relative pick notes against the grip note on a string', () => {
    const service = new PlayingPatternPlaybackPlannerService();

    const plan = service.buildPlaybackPlan([{
      measure: {
        timeSignature: '4/4',
        actions: [{
          technique: 'pick',
          pick: [{ mode: 'relative', string: 'second-from-bass', fretOffset: 0, anchor: 'grip-note' }]
        }, null, null, null]
      }
    }], tuning, 120, grip as any);

    expect(plan.instructions[0]).toMatchObject({
      notes: [
        { note: { semitone: 'B', octave: 2 } }
      ]
    });
  });

  it('resolves mixed relative and explicit pick notes in one action', () => {
    const service = new PlayingPatternPlaybackPlannerService();

    const plan = service.buildPlaybackPlan([{
      measure: {
        timeSignature: '4/4',
        actions: [{
          technique: 'pick',
          pick: [
            { mode: 'relative', string: 'second-from-bass', fretOffset: 0, anchor: 'grip-note' },
            { mode: 'explicit', string: 5, fret: 0 }
          ]
        }, null, null, null]
      }
    }], tuning, 120, grip as any);

    expect(plan.instructions[0]).toMatchObject({
      notes: [
        { note: { semitone: 'B', octave: 2 } },
        { note: { semitone: 'E', octave: 4 } }
      ]
    });
  });

  it('resolves relative hammer-ons from a previous relative base-note pick on barred strings', () => {
    const service = new PlayingPatternPlaybackPlannerService();

    const plan = service.buildPlaybackPlan([{
      measure: {
        timeSignature: '4/4',
        actions: [{
          technique: 'pick',
          pick: [{ mode: 'relative', string: 'second-from-bass', anchor: 'base-note' }]
        }, {
          technique: 'hammer-on',
          legatoMode: 'relative',
          legato: {
            string: 'second-from-bass',
            target: { anchor: 'grip-note', fretOffset: 0 }
          }
        }, null, null]
      }
    }], tuning, 120, barreGrip as any);

    expect(plan.instructions[1]).toMatchObject({
      technique: 'hammer-on',
      legato: {
        string: 2,
        source: { note: { semitone: 'D', octave: 3 } },
        target: { note: { semitone: 'A', octave: 3 } }
      }
    });
  });

  it('resolves legato source from a previous strum on the same string', () => {
    const service = new PlayingPatternPlaybackPlannerService();

    const plan = service.buildPlaybackPlan([{
      measure: {
        timeSignature: '4/4',
        actions: [{
          technique: 'strum',
          strum: { direction: 'D', strings: 'all' }
        }, {
          technique: 'hammer-on',
          legato: { string: 1, toFret: 4 }
        }, null, null]
      }
    }], tuning, 120, grip as any);

    expect(plan.instructions[1]).toMatchObject({
      technique: 'hammer-on',
      legato: {
        string: 1,
        source: { note: { semitone: 'B', octave: 2 } },
        target: { note: { semitone: 'C#', octave: 3 } }
      }
    });
  });

  it('uses chained legato targets as the next source on the same string', () => {
    const service = new PlayingPatternPlaybackPlannerService();

    const plan = service.buildPlaybackPlan([{
      measure: {
        timeSignature: '4/4',
        actions: [{
          technique: 'pick',
          pick: [{ mode: 'explicit', string: 1, fret: 2 }]
        }, {
          technique: 'hammer-on',
          legato: { string: 1, toFret: 4 }
        }, {
          technique: 'pull-off',
          legato: { string: 1, toFret: 2 }
        }, null]
      }
    }], tuning, 120, grip as any);

    expect(plan.instructions[2]).toMatchObject({
      technique: 'pull-off',
      legato: {
        source: { note: { semitone: 'C#', octave: 3 } },
        target: { note: { semitone: 'B', octave: 2 } }
      }
    });
  });

  it('plays orphan hammer-ons as target-only legato notes', () => {
    const service = new PlayingPatternPlaybackPlannerService();

    const plan = service.buildPlaybackPlan([{
      measure: {
        timeSignature: '4/4',
        actions: [{
          technique: 'hammer-on',
          legato: { string: 1, toFret: 4 }
        }, null, null, null]
      }
    }], tuning, 120, grip as any);

    expect(plan.instructions).toHaveLength(1);
    expect(plan.instructions[0]).toMatchObject({
      technique: 'hammer-on',
      legato: {
        string: 1,
        target: { note: { semitone: 'C#', octave: 3 } }
      },
      notes: [
        { note: { semitone: 'C#', octave: 3 } }
      ]
    });
    expect(plan.instructions[0].legato?.source).toBeUndefined();
  });

  it('skips orphan pull-offs and slides', () => {
    const service = new PlayingPatternPlaybackPlannerService();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const plan = service.buildPlaybackPlan([{
      measure: {
        timeSignature: '4/4',
        actions: [{
          technique: 'pull-off',
          legato: { string: 1, toFret: 0 }
        }, {
          technique: 'slide',
          legato: { string: 2, toFret: 4 }
        }, null, null]
      }
    }], tuning, 120, grip as any);

    expect(plan.instructions).toHaveLength(0);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(plan.diagnostics).toEqual([
      'pull-off skipped: no previous note is sounding on string 2',
      'slide skipped: no previous note is sounding on string 3'
    ]);
    warnSpy.mockRestore();
  });

  it('collects a diagnostic and still plans hammer-ons with non-ascending target frets', () => {
    const service = new PlayingPatternPlaybackPlannerService();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const plan = service.buildPlaybackPlan([{
      measure: {
        timeSignature: '4/4',
        actions: [{
          technique: 'pick',
          pick: [{ mode: 'explicit', string: 1, fret: 4 }]
        }, {
          technique: 'hammer-on',
          legato: { string: 1, toFret: 2 }
        }, null, null]
      }
    }], tuning, 120, grip as any);

    expect(plan.instructions[1]).toMatchObject({
      technique: 'hammer-on',
      legato: {
        source: { note: { semitone: 'C#', octave: 3 } },
        target: { note: { semitone: 'B', octave: 2 } }
      }
    });
    expect(warnSpy).not.toHaveBeenCalled();
    expect(plan.diagnostics).toEqual([expect.stringContaining('hammer-on warning')]);
    warnSpy.mockRestore();
  });

  it('resolves bass relative string against the lowest playable string of the current grip', () => {
    const service = new PlayingPatternPlaybackPlannerService();

    const plan = service.buildPlaybackPlan([{
      measure: {
        timeSignature: '4/4',
        actions: [{
          technique: 'pick',
          pick: [{ mode: 'relative', string: 'bass', anchor: 'grip-note', fretOffset: 0 }]
        }, null, null, null]
      }
    }], tuning, 120, barreGrip as any);

    expect(plan.instructions[0]).toMatchObject({
      notes: [
        { note: { semitone: 'D', octave: 3 } }
      ]
    });
  });

  it('resolves lower and upper middle separately for six playable strings', () => {
    const service = new PlayingPatternPlaybackPlannerService();
    const sixStringGrip = {
      strings: ['o', 'o', 'o', 'o', 'o', 'o']
    };

    const plan = service.buildPlaybackPlan([{
      measure: {
        timeSignature: '4/4',
        actions: [{
          technique: 'pick',
          pick: [
            { mode: 'relative', string: 'lower-middle', anchor: 'grip-note', fretOffset: 0 },
            { mode: 'relative', string: 'upper-middle', anchor: 'grip-note', fretOffset: 0 }
          ]
        }, null, null, null]
      }
    }], tuning, 120, sixStringGrip as any);

    expect(plan.instructions[0]).toMatchObject({
      notes: [
        { note: { semitone: 'D', octave: 3 } },
        { note: { semitone: 'G', octave: 3 } }
      ]
    });
  });

  it('resolves both middle strings to the center for five playable strings', () => {
    const service = new PlayingPatternPlaybackPlannerService();
    const fiveStringGrip = {
      strings: ['x', 'o', 'o', 'o', 'o', 'o']
    };

    const plan = service.buildPlaybackPlan([{
      measure: {
        timeSignature: '4/4',
        actions: [{
          technique: 'pick',
          pick: [
            { mode: 'relative', string: 'lower-middle', anchor: 'grip-note', fretOffset: 0 },
            { mode: 'relative', string: 'upper-middle', anchor: 'grip-note', fretOffset: 0 }
          ]
        }, null, null, null]
      }
    }], tuning, 120, fiveStringGrip as any);

    expect(plan.instructions[0]).toMatchObject({
      notes: [
        { note: { semitone: 'G', octave: 3 } },
        { note: { semitone: 'G', octave: 3 } }
      ]
    });
  });

  it('resolves four-string middles to the inner strings that overlap second-relative choices', () => {
    const service = new PlayingPatternPlaybackPlannerService();
    const fourStringGrip = {
      strings: ['x', 'x', 'o', 'o', 'o', 'o']
    };

    const plan = service.buildPlaybackPlan([{
      measure: {
        timeSignature: '4/4',
        actions: [{
          technique: 'pick',
          pick: [
            { mode: 'relative', string: 'second-from-bass', anchor: 'grip-note', fretOffset: 0 },
            { mode: 'relative', string: 'lower-middle', anchor: 'grip-note', fretOffset: 0 },
            { mode: 'relative', string: 'upper-middle', anchor: 'grip-note', fretOffset: 0 },
            { mode: 'relative', string: 'second-from-top', anchor: 'grip-note', fretOffset: 0 }
          ]
        }, null, null, null]
      }
    }], tuning, 120, fourStringGrip as any);

    expect(plan.instructions[0]).toMatchObject({
      notes: [
        { note: { semitone: 'G', octave: 3 } },
        { note: { semitone: 'G', octave: 3 } },
        { note: { semitone: 'B', octave: 3 } },
        { note: { semitone: 'B', octave: 3 } }
      ]
    });
  });

  it('resolves relative strum ranges across the playable strings of the current grip', () => {
    const service = new PlayingPatternPlaybackPlannerService();

    const plan = service.buildPlaybackPlan([{
      measure: {
        timeSignature: '4/4',
        actions: [{
          technique: 'strum',
          strum: { direction: 'D', strings: { from: 'second-from-bass', to: 'second-from-top' } }
        }, null, null, null]
      }
    }], tuning, 120, barreGrip as any);

    expect(plan.instructions[0]).toMatchObject({
      actionDuration: 0.125,
      playNotes: 'sequential',
      notes: [
        { note: { semitone: 'A', octave: 3 } },
        { note: { semitone: 'D', octave: 4 } },
        { note: { semitone: 'F#', octave: 4 } }
      ]
    });
  });

  it('normalizes reversed relative strum range endpoints', () => {
    const service = new PlayingPatternPlaybackPlannerService();

    const plan = service.buildPlaybackPlan([{
      measure: {
        timeSignature: '4/4',
        actions: [{
          technique: 'strum',
          strum: { direction: 'U', strings: { from: 'top', to: 'bass' } }
        }, null, null, null]
      }
    }], tuning, 120, barreGrip as any);

    expect(plan.instructions[0]).toMatchObject({
      actionDuration: 0.125,
      playNotes: 'reversed',
      notes: [
        { note: { semitone: 'D', octave: 3 } },
        { note: { semitone: 'A', octave: 3 } },
        { note: { semitone: 'D', octave: 4 } },
        { note: { semitone: 'F#', octave: 4 } },
        { note: { semitone: 'A', octave: 4 } }
      ]
    });
  });

  it('extends total duration to include the final strum tail', () => {
    const service = new PlayingPatternPlaybackPlannerService();
    const pattern = createDefaultPlayingPatterns(1).find(value => value.name === 'Chorus Lift Strum');

    expect(pattern).toBeDefined();

    const plan = service.buildPlaybackPlan([{
      measure: pattern!.measures[0]
    }], tuning, 120, grip as any);

    expect(plan.totalDuration).toBeGreaterThan(2);
    expect(plan.totalDuration).toBeCloseTo(3.75, 5);
    expect(plan.instructions.at(-1)).toMatchObject({
      time: 1.75,
      playbackDuration: 2,
      actionDuration: 0.125,
      technique: 'accented',
      playNotes: 'reversed'
    });
  });

  it('plays rewritten seeded relative patterns against the current grip', () => {
    const service = new PlayingPatternPlaybackPlannerService();
    const pattern = createDefaultPlayingPatterns(1).find(value => value.name === 'Boom-Chick Bass + Brush');

    expect(pattern).toBeDefined();

    const plan = service.buildPlaybackPlan([{
      measure: pattern!.measures[0]
    }], tuning, 120, grip as any);

    expect(plan.instructions[0]).toMatchObject({
      notes: [
        { note: { semitone: 'E', octave: 2 } }
      ]
    });
    expect(plan.instructions[1]).toMatchObject({
      playNotes: 'sequential'
    });
  });

  it('keeps seeded grouped fingerstyle picks as parallel note playback', () => {
    const service = new PlayingPatternPlaybackPlannerService();
    const pattern = createDefaultPlayingPatterns(1).find(value => value.name === '6/8 Bass + Pinch');

    expect(pattern).toBeDefined();

    const plan = service.buildPlaybackPlan([{
      measure: pattern!.measures[0]
    }], tuning, 120, grip as any);

    expect(plan.instructions[0]).toMatchObject({
      playNotes: 'parallel',
      notes: [
        { note: { semitone: 'E', octave: 2 } },
        { note: { semitone: 'B', octave: 3 } },
        { note: { semitone: 'E', octave: 4 } }
      ]
    });
  });
});
