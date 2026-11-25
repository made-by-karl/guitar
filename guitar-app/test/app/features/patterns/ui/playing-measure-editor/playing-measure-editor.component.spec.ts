import { MusicClipboardService } from '@/app/core/services/music-clipboard.service';
import { ModalService } from '@/app/core/services/modal.service';
import { NotificationService } from '@/app/core/services/notification.service';
import { it } from '@jest/globals';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Measure } from '@/app/features/patterns/services/playing-patterns.model';
import { PlayingMeasureEditorComponent } from '@/app/features/patterns/ui/playing-measure-editor/playing-measure-editor.component';

describe('PlayingMeasureEditorComponent', () => {
  it.each(['D', 'U'] as const)('replaces and deselects articulation while preserving Accent and %s strum data', direction => {
    const previous: Measure = { timeSignature: '4/4', actions: [{ technique: 'strum',
      strum: { direction, strings: { from: 'bass', to: 'top' } }, articulation: 'mute', modifiers: ['accent'] }] };
    const original = JSON.stringify(previous);
    component.measure.set(previous);
    component.actionGrips.set([{ measureIndex: 0, actionIndex: 0, gripId: 'grip-c', name: 'C' }]);
    for (const articulation of ['palm-mute', 'dead-note', 'mute'] as const) {
      component.toggleArticulation(0, articulation);
      expect(component.measure().actions[0]).toEqual({ ...previous.actions[0], articulation });
    }
    component.toggleArticulation(0, 'mute');
    expect(component.measure().actions[0]!.articulation).toBe('normal');
    component.toggleModifier(0, 'accent');
    expect(component.measure().actions[0]!.modifiers).toEqual([]);
    expect(component.actionGrips()[0].name).toBe('C');
    expect(JSON.stringify(previous)).toBe(original);
  });

  it('offers dead note only on strums and uses the compact native checkbox controls', () => {
    component.addAction(0, 'strum-up'); fixture.detectChanges();
    const label = [...fixture.nativeElement.querySelectorAll('label')].find((el: unknown) => (el as HTMLElement).textContent?.trim() === 'Dead note') as HTMLLabelElement;
    const checkbox = label.querySelector('input')!;
    checkbox.click(); fixture.detectChanges();
    expect(component.measure().actions[0]!.articulation).toBe('dead-note');
    expect(checkbox.checked).toBe(true);
    expect(fixture.nativeElement.querySelector('[id^="strumMode_"]')).toBeNull();
    component.addAction(0, 'pick');
    component.toggleArticulation(0, 'dead-note');
    expect(component.measure().actions[0]!.articulation).toBeUndefined();
    expect(component.getAvailableArticulations(component.measure().actions[0]!).map(o => o.value)).toEqual(['mute', 'palm-mute']);
    component.addAction(0, 'slide');
    expect(component.getAvailableArticulations(component.measure().actions[0]!)).toEqual([]);
  });
  let component: PlayingMeasureEditorComponent;
  let fixture: ComponentFixture<PlayingMeasureEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlayingMeasureEditorComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(PlayingMeasureEditorComponent);
    component = fixture.componentInstance;
    component.measure.set(createMeasure());
    component.actionGrips.set([]);
    fixture.detectChanges();
  });

  it('copies only actual actions, pastes at an empty slot without shifting rhythm, and remaps an explicit grip', async () => {
    const clipboard = TestBed.inject(MusicClipboardService);
    component.measure.set({ timeSignature: '4/4', actions: Array(16).fill(null) });
    component.copyAction(2);
    expect(clipboard.entries()).toHaveLength(0);
    component.addAction(0, 'pick');
    component.actionGrips.set([{ measureIndex: 0, actionIndex: 0, gripId: 'x|3|2|o|1|o', name: 'C' }]);
    component.copyAction(0);
    const id = clipboard.entries()[0].id;
    jest.spyOn(TestBed.inject(ModalService), 'show').mockReturnValue({ afterClosed: async () => id } as never);
    await component.pasteAction(6);
    await component.pasteAction(10);
    expect(component.measure().actions).toHaveLength(16);
    expect(component.measure().actions[6]).toEqual(component.measure().actions[0]);
    expect(component.measure().actions[6]).not.toBe(component.measure().actions[10]);
    expect(component.measure().actions[4]).toBeNull();
    expect(component.actionGrips().map(g => g.actionIndex)).toEqual([0, 6, 10]);
    const previous = component.measure();
    await component.pasteAction(6);
    expect(component.measure()).toBe(previous);
  });

  it('preserves destination context for relative actions and leaves canceled/changed destinations untouched', async () => {
    const clipboard = TestBed.inject(MusicClipboardService);
    component.addAction(0, 'pick');
    component.copyAction(0);
    const id = clipboard.entries()[0].id;
    component.actionGrips.set([{ measureIndex: 0, actionIndex: 2, gripId: 'x|3|2|o|1|o', name: 'C' }]);
    const show = jest.spyOn(TestBed.inject(ModalService), 'show');
    show.mockReturnValue({ afterClosed: async () => undefined } as never);
    const previous = component.measure();
    await component.pasteAction(2);
    expect(component.measure()).toBe(previous);
    show.mockReturnValue({ afterClosed: async () => id } as never);
    await component.pasteAction(2);
    expect(component.actionGrips()[0].actionIndex).toBe(2);
    expect(component.measure().actions[2]!.pick![0]).toMatchObject({ mode: 'relative', anchor: 'grip-note' });
    show.mockReturnValue({ afterClosed: async () => { component.addAction(4, 'percussive'); return id; } } as never);
    const error = jest.spyOn(TestBed.inject(NotificationService), 'error');
    await component.pasteAction(4);
    expect(component.measure().actions[4]!.technique).toBe('percussive');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('no longer empty'));
  });

  it.each(['4/4', '6/8'] as const)('labels every sixteenth position uniquely in %s', timeSignature => {
    component.measure.set({ timeSignature, actions: Array(timeSignature === '4/4' ? 16 : 12).fill(null) });
    component.toggleSixteenthSteps();
    const labels = component.getActionsForDisplay().map(action => component.getActionPositionLabel(action));
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.slice(0, 4)).toEqual(timeSignature === '4/4' ? ['1', '1e', '1&', '1a'] : ['1', '1&', '2', '2&']);
  });

  it('switches between single-string slides and a shared fret shift', () => {
    component.addAction(0, 'slide');
    component.setSlideScope(0, 'grip');
    component.updateSlideOffset(0, -2);
    expect(component.measure().actions[0]?.slide).toEqual({ fretOffset: -2 });
    expect(component.measure().actions[0]?.legato).toBeUndefined();
    component.setSlideScope(0, 'single');
    expect(component.measure().actions[0]?.slide).toBeUndefined();
    expect(component.measure().actions[0]?.legato).toBeDefined();
  });

  it.each(['slide', 'hammer-on', 'pull-off'] as const)('keeps the selected %s string numeric for playback', async technique => {
    component.addAction(0, technique);
    component.setLegatoMode(0, 'explicit');
    fixture.detectChanges();
    await fixture.whenStable();

    const select = fixture.nativeElement.querySelector('.pick-note select') as HTMLSelectElement;
    select.selectedIndex = 2;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.measure().actions[0]?.legato).toMatchObject({ string: 2 });
  });

  it('creates and edits pick actions inside one measure', () => {
    component.addAction(0, 'pick');
    component.addPickingNote(0);
    component.setPickNoteMode(0, 1, 'explicit');
    component.updatePickNoteString(0, 1, 4);
    component.updatePickNoteFret(0, 1, 7);

    expect(component.measure().actions[0]).toEqual({
      technique: 'pick',
      pick: [
        { mode: 'relative', string: 'bass', anchor: 'grip-note', fretOffset: 0 },
        { mode: 'explicit', string: 4, fret: 7 }
      ],
      modifiers: []
    });
  });

  it('resizes actions and removes out-of-range grips when changing time signature', () => {
    component.measure.set({
      timeSignature: '4/4',
      actions: Array(16).fill(null)
    });
    component.actionGrips.set([
      { measureIndex: 0, actionIndex: 2, gripId: 'grip-c', name: 'C' },
      { measureIndex: 0, actionIndex: 13, gripId: 'grip-g', name: 'G' }
    ]);

    component.changeTimeSignature('3/4');

    expect(component.measure().timeSignature).toBe('3/4');
    expect(component.measure().actions).toHaveLength(12);
    expect(component.actionGrips()).toEqual([
      { measureIndex: 0, actionIndex: 2, gripId: 'grip-c', name: 'C' }
    ]);
  });

  it('emits grip assignment requests and clears local grips', () => {
    const emitSpy = jest.spyOn(component.assignActionGrip, 'emit');
    component.actionGrips.set([{ measureIndex: 0, actionIndex: 0, gripId: 'grip-c', name: 'C' }]);

    component.requestActionGrip(4);
    component.clearMeasureGrips();

    expect(emitSpy).toHaveBeenCalledWith(4);
    expect(component.actionGrips()).toEqual([]);
  });
});

function createMeasure(): Measure {
  return {
    timeSignature: '4/4',
    actions: Array(16).fill(null)
  };
}
