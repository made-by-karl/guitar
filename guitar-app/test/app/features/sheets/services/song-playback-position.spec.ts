import { songPlaybackHighlight } from '@/app/features/sheets/services/song-playback-position';
import { SongSheetPlaybackState } from '@/app/features/sheets/services/song-part-playback.service';

const state: SongSheetPlaybackState = { type: 'part', source: 'editor', status: 'paused',
  partId: 'verse', occurrenceId: 'second', measureId: 'later', currentMeasureIndex: 3, actionIndex: 2 };

it('projects one resolved clock position to a stream or local measure without conflating repeated occurrences', () => {
  expect(songPlaybackHighlight(state, { source: 'editor' })).toEqual({ measureIndex: 3, actionIndex: 2, status: 'paused' });
  expect(songPlaybackHighlight(state, { source: 'editor', partId: 'verse', occurrenceId: 'second', measureId: 'later' }))
    .toEqual({ measureIndex: 0, actionIndex: 2, status: 'paused' });
  for (const scope of [
    { source: 'song' as const },
    { source: 'editor' as const, partId: 'verse', occurrenceId: 'first', measureId: 'later' },
    { source: 'editor' as const, partId: 'verse', occurrenceId: 'second', measureId: 'earlier' }
  ]) expect(songPlaybackHighlight(state, scope)).toBeUndefined();
  expect(songPlaybackHighlight({ ...state, status: 'preparing', actionIndex: undefined }, { source: 'editor' })).toBeUndefined();
  expect(songPlaybackHighlight({ type: 'none', status: 'idle' }, { source: 'editor' })).toBeUndefined();
});
