import type { PlayingPattern } from '../../src/app/features/patterns/services/playing-patterns.model';
import type { SongSheet } from '../../src/app/features/sheets/services/song-sheets.model';

export function richPattern(id = 'pattern', name = 'Fingerpicking'): PlayingPattern {
  return {
    id, name, description: 'All supported actions', category: 'Custom', suggestedGenre: '', exampleSong: '',
    createdAt: 100, updatedAt: 200, isCustom: false,
    measures: [{ timeSignature: '4/4', actions: [
      { technique: 'strum', modifiers: ['mute', 'palm-mute', 'accent'], strum: { direction: 'D', strings: [0, 2, 5] } },
      { technique: 'strum', strum: { direction: 'U', strings: { from: 'top', to: 'second-from-bass' } } },
      { technique: 'pick', pick: [
        { mode: 'explicit', string: 1, fret: -1 },
        { mode: 'relative', string: 'bass', anchor: 'base-note' },
        { mode: 'relative', string: 'lower-middle', anchor: 'grip-note', fretOffset: -2 }
      ] },
      { technique: 'hammer-on', legato: { string: 2, toFret: 5 } },
      { technique: 'pull-off', legatoMode: 'relative', legato: { string: 'upper-middle', target: { anchor: 'grip-note', fretOffset: -2 } } },
      { technique: 'slide', slide: { fretOffset: 2 } },
      { technique: 'slide', legatoMode: 'relative', legato: { string: 'top', target: { anchor: 'base-note' } } },
      { technique: 'percussive', percussive: { technique: 'body-knock' } },
      { technique: 'percussive', percussive: { technique: 'string-slap' } },
      ...Array(7).fill(null)
    ], actionGrips: [{ measureIndex: 0, actionIndex: 0, gripId: 'x|o|2|2|o|o', name: 'Custom A' }] },
    { timeSignature: '6/8', actions: Array(12).fill(null) }],
    actionGrips: [{ measureIndex: 1, actionIndex: 2, gripId: '3|2|o|o|o|3', name: 'G' }]
  };
}

export function richSheet(id = 'sheet', name = 'My song'): SongSheet {
  const pattern = richPattern();
  return {
    id, name, tuning: [
      { semitone: 'D', octave: 2 }, { semitone: 'A', octave: 2 }, { semitone: 'D', octave: 3 },
      { semitone: 'G', octave: 3 }, { semitone: 'A', octave: 3 }, { semitone: 'D', octave: 4 }
    ], capodaster: 3, tempo: 83, created: 100, updated: 200,
    links: [{ id: 'link', url: 'https://example.com/song', description: 'Lesson' }],
    grips: [{ gripId: 'x|o|2|2|o|o', name: 'A colour' }], patterns: [pattern],
    parts: [
      { id: 'verse', section: 'Verse', notes: 'Softly', measures: [{ id: 'measure', measure: pattern.measures[0] }] },
      { id: 'unused', section: '', notes: '', measures: [] }
    ], arrangement: [
      { id: 'first', partId: 'verse', lyrics: 'Morning words' },
      { id: 'second', partId: 'verse', lyrics: 'Evening words' }
    ]
  };
}

export function transferEnvelope(format: 'guitar-song-sheet' | 'guitar-playing-pattern' | 'guitar-backup', data: unknown) {
  return { format, formatVersion: 1, modelVersion: 1, exportedAt: 123456789, appVersion: '1.0.1', data };
}
