import { migratePlayingPatternPickNotes } from '@/app/core/services/database.service';
import { PlayingPattern } from '@/app/features/patterns/services/playing-patterns.model';
import { SongSheet } from '@/app/features/sheets/services/song-sheets.model';

describe('DatabaseService migrations', () => {
  it('migrates persisted playing patterns to per-note pick modes', () => {
    const pattern = createLegacyPattern([
      {
        technique: 'pick',
        pickMode: 'relative',
        pick: [
          { string: 'bass' },
          { string: 'top', anchor: 'base-note' }
        ]
      },
      {
        technique: 'pick',
        pick: [
          { string: 'middle', anchor: 'grip-note' },
          { string: 2, fret: 4 },
          { fret: 7 }
        ]
      },
      {
        technique: 'strum',
        strum: { direction: 'D', strings: { from: 'middle', to: 'top' } }
      },
      {
        technique: 'hammer-on',
        legatoMode: 'relative',
        legato: {
          string: 'middle',
          target: { anchor: 'grip-note', fretOffset: 2 }
        }
      }
    ]);

    migratePlayingPatternPickNotes(pattern);

    expect(pattern.measures[0].actions).toEqual([
      {
        technique: 'pick',
        pick: [
          { mode: 'relative', string: 'bass', anchor: 'grip-note', fretOffset: 0 },
          { mode: 'relative', string: 'top', anchor: 'base-note' }
        ]
      },
      {
        technique: 'pick',
        pick: [
          { mode: 'relative', string: 'lower-middle', anchor: 'grip-note', fretOffset: 0 },
          { mode: 'explicit', string: 2, fret: 4 },
          { mode: 'explicit', string: 0, fret: 7 }
        ]
      },
      {
        technique: 'strum',
        strum: { direction: 'D', strings: { from: 'lower-middle', to: 'top' } }
      },
      {
        technique: 'hammer-on',
        legatoMode: 'relative',
        legato: {
          string: 'lower-middle',
          target: { anchor: 'grip-note', fretOffset: 2 }
        }
      }
    ]);
  });

  it('migrates song-sheet embedded patterns without clearing data', () => {
    const sheet = {
      patterns: [
        createLegacyPattern([
          {
            technique: 'pick',
            pickMode: 'relative',
            pick: [{ string: 'second-from-bass', anchor: 'grip-note' }]
          }
        ])
      ]
    } as SongSheet;

    sheet.patterns.forEach(pattern => migratePlayingPatternPickNotes(pattern));

    expect(sheet.patterns).toHaveLength(1);
    expect(sheet.patterns[0].measures[0].actions[0]).toEqual({
      technique: 'pick',
      pick: [{ mode: 'relative', string: 'second-from-bass', anchor: 'grip-note', fretOffset: 0 }]
    });
  });
});

function createLegacyPattern(actions: unknown[]): PlayingPattern {
  return {
    id: 'legacy-pattern',
    name: 'Legacy Pattern',
    description: '',
    category: '',
    suggestedGenre: '',
    exampleSong: '',
    measures: [{
      timeSignature: '4/4',
      actions: actions as PlayingPattern['measures'][number]['actions']
    }],
    createdAt: 1,
    updatedAt: 1,
    isCustom: true
  };
}
