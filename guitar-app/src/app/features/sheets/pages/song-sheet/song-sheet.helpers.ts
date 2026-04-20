import { Grip } from '@/app/features/grips/services/grips/grip.model';
import { PlayingPattern } from '@/app/features/patterns/services/playing-patterns.model';
import { SongSheetPlaybackState } from '@/app/features/sheets/services/song-part-playback.service';
import {
  SongPart,
  SongPartPatternItem,
  SongSheetPattern,
  SongSheetWithData
} from '@/app/features/sheets/services/song-sheets.model';

export function createSongSheetEntityId(prefix: string): string {
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

export function cloneSongPartItem(item: SongPartPatternItem): SongPartPatternItem {
  return {
    id: item.id,
    patternId: item.patternId,
    measureTexts: item.measureTexts.map(text => ({ ...text })),
    actionGrips: item.actionGrips.map(grip => ({ ...grip }))
  };
}

export function cloneSongPart(part: SongPart): SongPart {
  return {
    id: part.id,
    section: part.section,
    items: part.items.map(item => cloneSongPartItem(item))
  };
}

export function createEmptySongPart(): SongPart {
  return {
    id: createSongSheetEntityId('sp'),
    section: '',
    items: []
  };
}

export function cloneSongSheetPattern<T extends PlayingPattern>(pattern: T): T {
  return {
    ...pattern,
    actionGrips: (pattern.actionGrips ?? []).map(grip => ({ ...grip })),
    measures: pattern.measures.map(measure => ({
      ...measure,
      actions: measure.actions.map(action => action ? {
        ...action,
        modifiers: action.modifiers ? [...action.modifiers] : undefined,
        strum: action.strum ? { ...action.strum } : undefined,
        pick: action.pick ? action.pick.map(note => ({ ...note })) : undefined,
        percussive: action.percussive ? { ...action.percussive } : undefined
      } : null)
    }))
  };
}

export function createEmptySongSheetPattern(): SongSheetPattern {
  const now = Date.now();
  return {
    id: createSongSheetEntityId('pat'),
    name: '',
    description: '',
    category: '',
    suggestedGenre: '',
    exampleSong: '',
    measures: [{
      timeSignature: '4/4',
      actions: Array(16).fill(null)
    }],
    actionGrips: [],
    createdAt: now,
    updatedAt: now,
    isCustom: true
  };
}

export function toSongSheetPattern(pattern: PlayingPattern): SongSheetPattern {
  return cloneSongSheetPattern<SongSheetPattern>({
    ...pattern,
    id: createSongSheetEntityId('pat'),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isCustom: true
  });
}

export function buildGripByIdMap(sheet: SongSheetWithData): Record<string, Grip | undefined> {
  return Object.fromEntries(
    sheet.grips.map(grip => [grip.gripId, grip.grip])
  );
}

export function isPartPlaybackActive(state: SongSheetPlaybackState, partId: string): boolean {
  return state.type === 'part' && state.partId === partId;
}

export function isPartPlaybackPaused(state: SongSheetPlaybackState, partId: string): boolean {
  return isPartPlaybackActive(state, partId) && state.status === 'paused';
}

export function getPartMeasureCounter(
  state: SongSheetPlaybackState,
  partId: string,
  totalMeasures: number
): string {
  if (!isPartPlaybackActive(state, partId)) {
    return totalMeasures > 0 ? `Measure 1 / ${totalMeasures}` : 'No measures';
  }

  return `Measure ${(state.currentMeasureIndex ?? 0) + 1} / ${state.totalMeasures ?? totalMeasures}`;
}

export function canRewindPart(state: SongSheetPlaybackState, partId: string): boolean {
  return isPartPlaybackActive(state, partId) && (state.currentMeasureIndex ?? 0) > 0;
}

export function canForwardPart(state: SongSheetPlaybackState, partId: string): boolean {
  return isPartPlaybackActive(state, partId) &&
    (state.currentMeasureIndex ?? 0) < ((state.totalMeasures ?? 1) - 1);
}
