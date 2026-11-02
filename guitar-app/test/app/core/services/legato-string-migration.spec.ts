import { migrateMeasureLegatoStringIndices, migrateSongSheetLegatoStringIndices } from '@/app/core/services/database.service';
import { note } from '@/app/core/music/semitones';
import { PlayingPatternPlaybackPlannerService } from '@/app/features/patterns/services/playing-pattern-playback-planner.service';
import { Measure, PlayingPattern } from '@/app/features/patterns/services/playing-patterns.model';
import { SongSheet } from '@/app/features/sheets/services/song-sheets.model';

describe('Persisted legato string repair', () => {
  it.each(['slide', 'hammer-on', 'pull-off'] as const)('repairs all six explicit %s string indices', technique => {
    const measure = {
      timeSignature: '4/4',
      actions: Array.from({ length: 6 }, (_, string) => ({
        technique, legatoMode: 'explicit', legato: { string: String(string), toFret: 12 }
      }))
    } as unknown as Measure;

    migrateMeasureLegatoStringIndices(measure);
    migrateMeasureLegatoStringIndices(measure);

    expect(measure.actions.map(action => action?.legato)).toEqual(
      Array.from({ length: 6 }, (_, string) => ({ string, toFret: 12 }))
    );
  });

  it('preserves numeric, relative, and group actions and empty slots', () => {
    const measure: Measure = { timeSignature: '4/4', actions: [
      null,
      { technique: 'slide', legato: { string: 2, toFret: 12 } },
      { technique: 'slide', legatoMode: 'relative', legato: { string: 'lower-middle', target: { anchor: 'grip-note', fretOffset: 2 } } },
      { technique: 'slide', slide: { fretOffset: 2 } }
    ] };
    const original = JSON.parse(JSON.stringify(measure));

    migrateMeasureLegatoStringIndices(measure);

    expect(measure).toEqual(original);
  });

  it('repairs song parts and embedded patterns so a saved slide finds its preceding strum', () => {
    const measure = { timeSignature: '4/4', actions: Array(16).fill(null) } as Measure;
    measure.actions[0] = { technique: 'strum', strum: { direction: 'D', strings: 'bass' } };
    measure.actions[9] = { technique: 'strum', strum: { direction: 'D', strings: 'bass' } };
    // IndexedDB can contain strings despite the TypeScript interface.
    measure.actions[15] = JSON.parse(JSON.stringify({
      technique: 'slide', legatoMode: 'explicit', legato: { string: '2', toFret: 12 }
    }));
    measure.actionGrips = [
      { measureIndex: 0, actionIndex: 0, gripId: 'o|8|7|x|x|x', name: '087xxx' },
      { measureIndex: 0, actionIndex: 9, gripId: 'o|7|10|x|x|x', name: '0710xxx' }
    ];
    const embeddedMeasure = JSON.parse(JSON.stringify(measure)) as Measure;
    const sheet: SongSheet = {
      id: 'song', name: 'Cyberpunk Campfire',
      tuning: [note('D', 2), note('A', 2), note('D', 3), note('G', 3), note('B', 3), note('E', 4)],
      tempo: 80, capodaster: 0, created: 1, updated: 2, links: [], grips: [],
      patterns: [{ measures: [embeddedMeasure] } as PlayingPattern],
      parts: [{ id: 'part', section: 'P1', notes: '', measures: [{ id: 'measure', measure }] }],
      arrangement: [{ id: 'occurrence', partId: 'part', lyrics: '' }]
    };

    migrateSongSheetLegatoStringIndices(sheet);

    expect(embeddedMeasure.actions[15]?.legato).toEqual({ string: 2, toFret: 12 });
    expect(sheet.parts[0].measures[0].measure.actions[15]?.legato).toEqual({ string: 2, toFret: 12 });
    expect(sheet.arrangement).toEqual([{ id: 'occurrence', partId: 'part', lyrics: '' }]);
    expect(sheet.updated).toBe(2);
    const plan = new PlayingPatternPlaybackPlannerService().buildPlaybackPlan([
      { measure, actionGrips: measure.actionGrips }
    ], sheet.tuning, sheet.tempo);
    expect(plan.diagnostics).toEqual([]);
    expect(plan.instructions[2]).toMatchObject({
      technique: 'slide', time: 2.8125,
      legato: { string: 2, source: { note: note('C', 4) }, target: { note: note('D', 4) } }
    });
  });
});
