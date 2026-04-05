import { note } from '@/app/core/music/semitones';
import { RhythmPatternPlaybackPlannerService } from '@/app/features/patterns/services/rhythm-pattern-playback-planner.service';

describe('RhythmPatternPlaybackPlannerService', () => {
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

  it('builds hammer-on instructions with source and target notes', () => {
    const service = new RhythmPatternPlaybackPlannerService();

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
    const service = new RhythmPatternPlaybackPlannerService();

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
      legato: {
        string: 2,
        source: { note: { semitone: 'F#', octave: 3 } },
        target: { note: { semitone: 'E', octave: 3 } }
      }
    });
  });

  it('builds slide instructions on the selected string', () => {
    const service = new RhythmPatternPlaybackPlannerService();

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
});
