import { TestBed } from '@angular/core/testing';
import { MusicClipboardService } from '@/app/core/services/music-clipboard.service';
import { Measure, PlayingAction } from '@/app/features/patterns/services/playing-patterns.model';
import { resolveNotationGrip } from '@/app/features/patterns/services/playing-pattern-notation-resolver';

const grip = { measureIndex: 0, actionIndex: 3, gripId: 'x|3|2|o|1|o', name: 'C' };
function richMeasure(): Measure {
  return { timeSignature: '6/8', actions: [
    null, { technique: 'pick', articulation: 'palm-mute', modifiers: ['accent'], pick: [{ mode: 'relative', string: 'top', anchor: 'grip-note', fretOffset: 2 }] },
    { technique: 'hammer-on', legatoMode: 'relative', legato: { string: 'top', target: { anchor: 'grip-note', fretOffset: 1 } } },
    { technique: 'strum', strum: { direction: 'D', strings: [0, 2, 4] }, articulation: 'dead-note' },
    { technique: 'slide', slide: { fretOffset: 2 } },
    { technique: 'percussive', percussive: { technique: 'string-slap' } }, ...Array(6).fill(null)
  ], actionGrips: [{ ...grip }] };
}

describe('MusicClipboardService', () => {
  it('retains independent history and complete deep snapshots through source edits and repeated pastes', () => {
    const clipboard = new MusicClipboardService();
    const source = richMeasure();
    const original = richMeasure();
    clipboard.copyMeasures([source], 'Song A · Part A');
    const id = clipboard.entries()[0].id;
    source.actions[1]!.pick![0] = { mode: 'explicit', string: 1, fret: 12 };
    source.actions[2]!.legato = { string: 1, toFret: 9 };
    source.actionGrips![0].name = 'Changed';
    source.actions.splice(0);
    clipboard.copyAction({ technique: 'slide', slide: { fretOffset: -2 } }, undefined, 'Song B');
    expect(clipboard.entries().map(e => e.source)).toEqual(['Song B', 'Song A · Part A']);
    expect(clipboard.read(id, 'action')).toBeUndefined();
    const paste = clipboard.read(id, 'measures')![0];
    expect(paste).toEqual(original);
    paste.actions[2]!.legato = { string: 0, toFret: 12 };
    (paste.actions[3]!.strum!.strings as number[]).push(5);
    paste.actions[4]!.slide!.fretOffset = 10;
    paste.actions[5]!.percussive!.technique = 'body-knock';
    expect(clipboard.read(id, 'measures')![0]).toEqual(original);
    clipboard.remove(id);
    expect(clipboard.read(id, 'measures')).toBeUndefined();
    expect(paste.actions).toHaveLength(12);
    expect(clipboard.entries()).toHaveLength(1);
  });

  it('keeps full explicit grip fingerings portable without a source library record and remaps action references', () => {
    const clipboard = new MusicClipboardService();
    const action: PlayingAction = { technique: 'pick', articulation: 'mute', modifiers: ['accent'], pick: [{ mode: 'explicit', string: 2, fret: 4 }] };
    clipboard.copyAction(action, { ...grip, measureIndex: 9, actionIndex: 12 }, 'Deleted source');
    expect(clipboard.entries()[0].preview).toContain('string 4, fret 4');
    const paste = clipboard.read(clipboard.entries()[0].id, 'action')![0];
    expect(paste.actions[0]).toEqual(action);
    expect(paste.actionGrips).toEqual([{ ...grip, actionIndex: 0 }]);
    expect(resolveNotationGrip(paste.actionGrips![0].gripId)?.strings).toHaveLength(6);
    clipboard.copyAction({ technique: 'hammer-on', legatoMode: 'relative', legato: { string: 'top', target: { anchor: 'base-note' } } }, undefined, 'Relative');
    expect(clipboard.read(clipboard.entries()[0].id, 'action')![0].actionGrips).toEqual([]);
  });

  it('rejects unresolved explicit dependencies atomically without replacing history', () => {
    const clipboard = new MusicClipboardService();
    clipboard.copyMeasures([richMeasure()], 'Valid');
    const invalid = { ...richMeasure(), actionGrips: [{ ...grip, gripId: 'missing' }] };
    expect(() => clipboard.copyMeasures([richMeasure(), invalid], 'Invalid')).toThrow('explicit grip');
    expect(clipboard.entries().map(e => e.source)).toEqual(['Valid']);
  });

  it('shares one root instance across editor injectors but starts empty in a new app session', () => {
    const clipboard = TestBed.inject(MusicClipboardService);
    clipboard.copyMeasures([richMeasure()], 'Source');
    expect(TestBed.inject(MusicClipboardService).entries()).toHaveLength(1);
    TestBed.resetTestingModule();
    expect(TestBed.inject(MusicClipboardService).entries()).toEqual([]);
  });
});
