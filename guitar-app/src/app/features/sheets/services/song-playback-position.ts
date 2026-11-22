import { PlaybackHighlight } from '@/app/core/services/playback-highlight';
import { SongPlaybackSource, SongSheetPlaybackState } from '@/app/features/sheets/services/song-part-playback.service';

export interface SongPlaybackViewScope {
  source: SongPlaybackSource;
  partId?: string;
  occurrenceId?: string;
  measureId?: string;
}

/** Project the resolved playback clock into a view's own measure coordinates. */
export function songPlaybackHighlight(state: SongSheetPlaybackState, scope: SongPlaybackViewScope): PlaybackHighlight | undefined {
  if (state.source !== scope.source || state.actionIndex === undefined ||
    (state.status !== 'playing' && state.status !== 'buffering' && state.status !== 'paused') ||
    (scope.partId !== undefined && (state.partId !== scope.partId || state.occurrenceId !== scope.occurrenceId)) ||
    (scope.measureId !== undefined && state.measureId !== scope.measureId)) return undefined;
  return { measureIndex: scope.measureId === undefined ? state.currentMeasureIndex ?? 0 : 0,
    actionIndex: state.actionIndex, status: state.status };
}
