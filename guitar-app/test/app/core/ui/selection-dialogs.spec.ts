import { Chord } from '@/app/core/music/chords';
import { SelectionMode } from '@/app/core/ui/selection-mode';
import { GripSelectorModalComponent } from '@/app/features/grips/ui/grip-selector-modal/grip-selector-modal.component';
import { ChordService } from '@/app/features/grips/services/chords/chord.service';
import { parseGrip, TunedGrip } from '@/app/features/grips/services/grips/grip.model';
import { PatternLibrarySelectorModalComponent } from '@/app/features/patterns/ui/pattern-library-selector-modal/pattern-library-selector-modal.component';
import { PlayingPattern } from '@/app/features/patterns/services/playing-patterns.model';

describe('Selection dialog validation', () => {
  const chord: Chord = { root: 'C', modifiers: [] };
  const grips: TunedGrip[] = ['x|3|2|o|1|o', 'x|x|o|2|3|2'].map(value => ({ ...parseGrip(value), notes: [], inversion: 'root', isIncomplete: false, omittedToneRoles: [] }));
  const patterns: PlayingPattern[] = ['first', 'second'].map(id => ({ id, name: id, category: '', description: '', suggestedGenre: '', exampleSong: '', measures: [], createdAt: 0, updatedAt: 0 }));

  it.each<SelectionMode>(['single', 'multiple'])('only applies a valid grip count for %s selection', mode => {
    const close = jest.fn();
    const modal = new GripSelectorModalComponent({ close, afterClosed: async () => ({ chord, grips: [] }) }, { selectionMode: mode }, new ChordService());
    expect(modal.canApply).toBe(false);
    modal.onSelectionChange({ chord, grips });
    modal.onSave();
    expect(close).toHaveBeenCalledTimes(mode === 'multiple' ? 1 : 0);
    close.mockClear();
    modal.onSelectionChange({ chord, grips: [grips[1]] });
    modal.onSave();
    expect(close).toHaveBeenCalledWith({ chord, grips: [grips[1]] });
  });

  it.each<SelectionMode>(['single', 'multiple'])('only applies a valid pattern count for %s selection', mode => {
    const close = jest.fn();
    const modal = new PatternLibrarySelectorModalComponent({ close, afterClosed: async () => ({ patterns: [] }) }, { selectionMode: mode });
    expect(modal.canApply).toBe(false);
    modal.onSelectionChange({ patterns });
    modal.onSave();
    expect(close).toHaveBeenCalledTimes(mode === 'multiple' ? 1 : 0);
    close.mockClear();
    modal.onSelectionChange({ patterns: [patterns[1]] });
    modal.onSave();
    expect(close).toHaveBeenCalledWith({ patterns: [patterns[1]] });
  });
});
