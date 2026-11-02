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

  it('preserves numeric, relative, and empty slots', () => {
    const measure: Measure = { timeSignature: '4/4', actions: [
      null,
      { technique: 'slide', legato: { string: 2, toFret: 12 } },
      { technique: 'slide', legatoMode: 'relative', legato: { string: 'lower-middle', target: { anchor: 'grip-note', fretOffset: 2 } } },
    ] };
    const original = JSON.parse(JSON.stringify(measure));

    migrateMeasureLegatoStringIndices(measure);

    expect(measure).toEqual(original);
  });

});
