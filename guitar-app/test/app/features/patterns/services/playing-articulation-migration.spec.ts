import { migrateMeasureArticulations, migrateSheetArticulations } from '@/app/features/patterns/services/playing-articulation-migration';
import { Measure, PlayingAction } from '@/app/features/patterns/services/playing-patterns.model';
import { richSheet } from '../../../../fixtures/data-transfer';

describe('Articulation data upgrade', () => {
  it.each(['strum', 'pick'] as const)('preserves released playback precedence and Accent for %s', technique => {
    const flags = [undefined, [], ['accent'], ['palm-mute'], ['mute'], ['palm-mute', 'mute', 'accent']];
    const actions = flags.map(modifiers => ({ technique, modifiers,
      ...(technique === 'strum' ? { strum: { direction: 'U', strings: [0, 5] } } : { pick: [{ mode: 'explicit', string: 0, fret: 3 }] })
    }));
    const measure = { timeSignature: '4/4', actions: [...actions, null] } as unknown as Measure;
    migrateMeasureArticulations(measure);
    expect(measure.actions.map(action => action?.articulation)).toEqual([undefined, undefined, undefined, 'palm-mute', 'mute', 'mute', undefined]);
    expect(measure.actions[5]?.modifiers).toEqual(['accent']);
    expect(measure.actions[3]?.modifiers).toEqual([]);
    const snapshot = JSON.stringify(measure);
    migrateMeasureArticulations(measure);
    expect(JSON.stringify(measure)).toBe(snapshot);
  });

  it('keeps canonical articulation authoritative, preserves aggregate content and independently owned snapshots', () => {
    const sheet = JSON.parse(JSON.stringify(richSheet())) as ReturnType<typeof richSheet>;
    const canonical: PlayingAction = { technique: 'strum', strum: { direction: 'D', strings: 'bass' }, articulation: 'dead-note', modifiers: ['accent'] };
    sheet.patterns[0].measures[0].actions[0] = canonical;
    const before = JSON.stringify(sheet);
    migrateSheetArticulations(sheet);
    migrateSheetArticulations(sheet);
    expect(JSON.stringify(sheet)).toBe(before);
    sheet.patterns[0].measures[0].actions[0]!.articulation = 'normal';
    expect(sheet.parts[0].measures[0].measure.actions[0]!.articulation).toBe('mute');
  });
});
