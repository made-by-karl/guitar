import { Measure, PlayingAction, PlayingPattern } from '@/app/features/patterns/services/playing-patterns.model';
import type { SongSheet } from '@/app/features/sheets/services/song-sheets.model';

/** Released legacy flags are interpreted only at database/portable-version boundaries. */
export function migrateMeasureArticulations(measure: Measure): void {
  measure.actions?.forEach(action => {
    if (!action) return;
    const legacy = action as Omit<PlayingAction, 'modifiers'> & { modifiers?: string[] };
    if (action.articulation === undefined && (action.technique === 'strum' || action.technique === 'pick')) {
      if (legacy.modifiers?.includes('mute')) action.articulation = 'mute';
      else if (legacy.modifiers?.includes('palm-mute')) action.articulation = 'palm-mute';
    }
    if (legacy.modifiers) action.modifiers = legacy.modifiers.filter((value): value is 'accent' => value === 'accent');
    // strum.mode was development-only; discard it without interpreting it.
    if (action.strum) delete (action.strum as typeof action.strum & { mode?: unknown }).mode;
  });
}

export function migratePatternArticulations(pattern: PlayingPattern): void {
  pattern.measures?.forEach(migrateMeasureArticulations);
}

export function migrateSheetArticulations(sheet: SongSheet): void {
  sheet.patterns?.forEach(migratePatternArticulations);
  sheet.parts?.forEach(part => part.measures?.forEach(item => migrateMeasureArticulations(item.measure)));
}
