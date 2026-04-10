import { note } from '@/app/core/music/semitones';
import { createDefaultPlayingPatterns } from '@/app/features/patterns/services/playing-pattern-defaults';
import { PlayingPatternPlaybackPlannerService } from '@/app/features/patterns/services/playing-pattern-playback-planner.service';

describe('PlayingPatternPlaybackPlannerService', () => {
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

  it('builds hammer-on instructions with source and target notes', () => {
    const service = new PlayingPatternPlaybackPlannerService();

    const plan = service.buildPlaybackPlan([{
      measure: {
        timeSignature: '4/4',
        actions: [{
          technique: 'hammer-on',
          legato: { string: 1, fromFret: 2, toFret: 4 }
        }, null, null, null]
      }
    }], tuning, 120, grip as any);

    expect(plan.instructions).toHaveLength(1);
    expect(plan.instructions[0]).toMatchObject({
      technique: 'hammer-on',
      playbackDuration: 0.25,
      actionDuration: 0.125,
      legato: {
        string: 1,
        source: { note: { semitone: 'B', octave: 2 } },
        target: { note: { semitone: 'C#', octave: 3 } }
      },
      notes: [
        { note: { semitone: 'B', octave: 2 } },
        { note: { semitone: 'C#', octave: 3 } }
      ]
    });
  });

  it('builds pull-off instructions with descending notes', () => {
    const service = new PlayingPatternPlaybackPlannerService();

    const plan = service.buildPlaybackPlan([{
      measure: {
        timeSignature: '4/4',
        actions: [{
          technique: 'pull-off',
          legato: { string: 2, fromFret: 4, toFret: 2 }
        }, null, null, null]
      }
    }], tuning, 120, grip as any);

    expect(plan.instructions[0]).toMatchObject({
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
          technique: 'hammer-on',
          legato: { string: 1, fromFret: 2, toFret: 4 }
        }, {
          technique: 'pick',
          pick: [{ string: 5, fret: 0 }]
        }, null, null]
      }
    }], tuning, 120, grip as any);

    expect(plan.instructions[0]).toMatchObject({
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
          technique: 'pull-off',
          legato: { string: 2, fromFret: 4, toFret: 2 }
        }, {
          technique: 'pick',
          pick: [{ string: 2, fret: 0 }]
        }, null, null]
      }
    }], tuning, 120, grip as any);

    expect(plan.instructions[0]).toMatchObject({
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
          technique: 'slide',
          legato: { string: 0, fromFret: 3, toFret: 5 }
        }, null, null, null]
      }
    }], tuning, 120, grip as any);

    expect(plan.instructions[0]).toMatchObject({
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
          pickMode: 'relative',
          pick: [{ role: 'second-from-bass', fretOffset: 0, anchor: 'grip-note' }]
        }, null, null, null]
      }
    }], tuning, 120, grip as any);

    expect(plan.instructions[0]).toMatchObject({
      notes: [
        { note: { semitone: 'B', octave: 2 } }
      ]
    });
  });

  it('resolves relative hammer-ons from the base note on barred strings', () => {
    const service = new PlayingPatternPlaybackPlannerService();

    const plan = service.buildPlaybackPlan([{
      measure: {
        timeSignature: '4/4',
        actions: [{
          technique: 'hammer-on',
          legatoMode: 'relative',
          legato: {
            role: 'second-from-bass',
            start: { anchor: 'base-note' },
            target: { anchor: 'grip-note', fretOffset: 0 }
          }
        }, null, null, null]
      }
    }], tuning, 120, barreGrip as any);

    expect(plan.instructions[0]).toMatchObject({
      technique: 'hammer-on',
      legato: {
        string: 2,
        source: { note: { semitone: 'D', octave: 3 } },
        target: { note: { semitone: 'A', octave: 3 } }
      }
    });
  });

  it('resolves bass role against the lowest playable string of the current grip', () => {
    const service = new PlayingPatternPlaybackPlannerService();

    const plan = service.buildPlaybackPlan([{
      measure: {
        timeSignature: '4/4',
        actions: [{
          technique: 'pick',
          pickMode: 'relative',
          pick: [{ role: 'bass', anchor: 'grip-note', fretOffset: 0 }]
        }, null, null, null]
      }
    }], tuning, 120, barreGrip as any);

    expect(plan.instructions[0]).toMatchObject({
      notes: [
        { note: { semitone: 'D', octave: 3 } }
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
    const pattern = createDefaultPlayingPatterns(1).find(value => value.name === 'Percussive Campfire Groove');

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
      technique: 'normal',
      playNotes: 'reversed'
    });
  });

  it('plays rewritten seeded relative patterns against the current grip', () => {
    const service = new PlayingPatternPlaybackPlannerService();
    const pattern = createDefaultPlayingPatterns(1).find(value => value.name === 'Bass + Brush Hybrid');

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
});
