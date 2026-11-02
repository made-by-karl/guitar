import { it } from '@jest/globals';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Measure } from '@/app/features/patterns/services/playing-patterns.model';
import { PlayingMeasureEditorComponent } from '@/app/features/patterns/ui/playing-measure-editor/playing-measure-editor.component';

describe('PlayingMeasureEditorComponent', () => {
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

  it.each(['4/4', '6/8'] as const)('labels every sixteenth position uniquely in %s', timeSignature => {
    component.measure.set({ timeSignature, actions: Array(timeSignature === '4/4' ? 16 : 12).fill(null) });
    component.toggleSixteenthSteps();
    const labels = component.getActionsForDisplay().map(action => component.getActionPositionLabel(action));
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.slice(0, 4)).toEqual(timeSignature === '4/4' ? ['1', '1e', '1&', '1a'] : ['1', '1&', '2', '2&']);
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
